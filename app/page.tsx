"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend
} from "recharts";
import {
  Wallet, Users, Plus, LogOut, TrendingUp, TrendingDown,
  CalendarDays, CheckCircle2, Circle, Trash2, Copy, RefreshCw,
  LayoutDashboard, ReceiptText, ArrowUpRight, ArrowDownRight
} from "lucide-react";

type Profile = {
  user_id: string;
  family_id: string;
  display_name: string;
};

type Operation = {
  id: string;
  family_id: string;
  created_by: string;
  member_name: string;
  title: string;
  kind: "income" | "mandatory" | "shared" | "personal";
  amount: number;
  operation_date: string;
  settled: boolean;
  category: string | null;
};

const colors = ["#d99b42", "#7184ba", "#a2a9a5"];

const money = (n: number) =>
  new Intl.NumberFormat("ru-BY", {
    style: "currency",
    currency: "BYN",
    minimumFractionDigits: 2
  }).format(n);

const formatDate = (value: string) =>
  new Date(value + "T12:00:00").toLocaleDateString("ru-BY");

export default function Home() {
  const [supabase] = useState(() => createClient());

  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [familyCode, setFamilyCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [familyName, setFamilyName] = useState("Наша семья");
  const [displayName, setDisplayName] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("signup");

  const [operations, setOperations] = useState<Operation[]>([]);
  const [tab, setTab] = useState<"overview" | "operations">("overview");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Operation["kind"]>("shared");
  const [category, setCategory] = useState("Продукты");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memberName, setMemberName] = useState("");
  const [settled, setSettled] = useState(false);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => setSession(next)
    );

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (session?.user) {
      loadProfile();
    } else {
      setProfile(null);
      setOperations([]);
      setInviteCode("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function loadProfile() {
    if (!session?.user?.id) return;

    const { data, error } = await supabase
      .from("family_members")
      .select("user_id,family_id,display_name")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }

    if (!data) {
      setProfile(null);
      return;
    }

    setProfile(data);
    setMemberName(data.display_name);
    setDisplayName(data.display_name);

    const { data: familyData, error: familyError } = await supabase
      .from("families")
      .select("name,invite_code")
      .eq("id", data.family_id)
      .single();

    if (familyError) {
      setMessage("Не удалось загрузить данные семьи: " + familyError.message);
    } else {
      setFamilyName(familyData?.name || "Наша семья");
      setInviteCode(familyData?.invite_code || "");
    }

    await loadOperations(data.family_id);
  }

  async function loadOperations(familyId: string) {
    const { data, error } = await supabase
      .from("operations")
      .select("*")
      .eq("family_id", familyId)
      .order("operation_date", { ascending: false });

    if (error) {
      setMessage(error.message);
    } else {
      setOperations((data || []) as Operation[]);
    }
  }

  async function authenticate() {
    setBusy(true);
    setMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password
        });

        if (error) throw error;

        if (!data.session) {
          setMessage(
            "Проверьте почту и подтвердите регистрацию. Затем войдите, чтобы создать семью или присоединиться по коду."
          );
        } else {
          setSession(data.session);
          setMessage("Аккаунт создан. Теперь настройте семейный профиль.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;
        setSession(data.session);
      }
    } catch (e: any) {
      setMessage(e.message || "Не удалось выполнить вход");
    } finally {
      setBusy(false);
    }
  }

  async function setupFamily(joinExisting: boolean) {
    if (!displayName.trim()) {
      setMessage("Введите имя участника.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const rpc = joinExisting ? "join_family_by_code" : "create_family";

      const args = joinExisting
        ? {
            invite_code_input: familyCode.trim().toUpperCase(),
            member_name_input: displayName.trim()
          }
        : {
            family_name_input: familyName.trim(),
            member_name_input: displayName.trim()
          };

      const { error } = await supabase.rpc(rpc, args);

      if (error) throw error;

      await loadProfile();

      setMessage(
        joinExisting
          ? "Вы присоединились к семейному бюджету."
          : "Семья создана. Передайте код приглашения второму участнику."
      );
    } catch (e: any) {
      setMessage(e.message || "Не удалось настроить семейный профиль");
    } finally {
      setBusy(false);
    }
  }

  async function addOperation() {
    if (!profile || !title.trim() || Number(amount) <= 0) return;

    setBusy(true);
    setMessage("");

    const { error } = await supabase.from("operations").insert({
      family_id: profile.family_id,
      created_by: session.user.id,
      member_name: profile.display_name,
      title: title.trim(),
      kind,
      category,
      amount: Number(amount),
      operation_date: date,
      settled
    });

    if (error) {
      setMessage(error.message);
    } else {
      setTitle("");
      setAmount("");
      setSettled(false);
      setShowForm(false);
      await loadOperations(profile.family_id);
    }

    setBusy(false);
  }

  async function toggleSettled(op: Operation) {
    const { error } = await supabase
      .from("operations")
      .update({ settled: !op.settled })
      .eq("id", op.id);

    if (error) {
      setMessage(error.message);
    } else if (profile) {
      await loadOperations(profile.family_id);
    }
  }

  async function deleteOperation(id: string) {
    const { error } = await supabase
      .from("operations")
      .delete()
      .eq("id", id);

    if (error) {
      setMessage(error.message);
    } else if (profile) {
      await loadOperations(profile.family_id);
    }
  }

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setMessage("Код семьи скопирован!");
    } catch {
      setMessage("Не удалось скопировать код. Выделите его вручную.");
    }
  }

  const income = operations
    .filter(o => o.kind === "income" && o.settled)
    .reduce((s, o) => s + Number(o.amount), 0);

  const spent = operations
    .filter(o => o.kind !== "income" && o.settled)
    .reduce((s, o) => s + Number(o.amount), 0);

  const pending = operations
    .filter(o => o.kind !== "income" && !o.settled)
    .reduce((s, o) => s + Number(o.amount), 0);

  const balance = income - spent;

  const expenseCategories = Array.from(
    new Set(
      operations
        .filter(o => o.kind !== "income" && o.settled)
        .map(o => o.category || (
          o.kind === "mandatory" ? "Обязательные платежи" :
          o.kind === "personal" ? "Личные расходы" : "Общие расходы"
        ))
    )
  );

  const pie = expenseCategories.map(name => ({
    name,
    value: operations
      .filter(o => o.kind !== "income" && o.settled && (
        (o.category || (
          o.kind === "mandatory" ? "Обязательные платежи" :
          o.kind === "personal" ? "Личные расходы" : "Общие расходы"
        )) === name
      ))
      .reduce((sum, o) => sum + Number(o.amount), 0)
  })).filter(item => item.value > 0);

  const members = Array.from(new Set(operations.map(o => o.member_name)));

  const memberStats = members.map(name => ({
    name,
    income: operations
      .filter(o => o.member_name === name && o.kind === "income" && o.settled)
      .reduce((s, o) => s + Number(o.amount), 0),
    expenses: operations
      .filter(o => o.member_name === name && o.kind !== "income" && o.settled)
      .reduce((s, o) => s + Number(o.amount), 0)
  }));

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel("family-operations-" + profile.family_id)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operations",
          filter: `family_id=eq.${profile.family_id}`
        },
        () => loadOperations(profile.family_id)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.family_id]);

  if (!session) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <div className="brand">
            <span className="brand-icon"><Wallet size={24} /></span>
            <div>
              <b>FinFamily</b>
              <small>Семейные финансы · BYN</small>
            </div>
          </div>

          <h1>{mode === "signup" ? "Создайте аккаунт" : "С возвращением"}</h1>
          <p className="muted">
            Два участника, один семейный обзор. Ваши данные синхронизируются через облачную базу.
          </p>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label>
            Пароль
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
            />
          </label>

          <button
            className="primary full"
            disabled={busy || !email || password.length < 6}
            onClick={authenticate}
          >
            {busy ? "Подождите…" : mode === "signup" ? "Зарегистрироваться" : "Войти"}
          </button>

          <button
            className="link full"
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          >
            {mode === "signup"
              ? "Уже есть аккаунт? Войти"
              : "Нет аккаунта? Зарегистрироваться"}
          </button>

          {message && <p className="notice">{message}</p>}

          <p className="tiny">
            Регистрация требует подключения собственного проекта Supabase.
          </p>
        </section>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <div className="brand">
            <span className="brand-icon"><Users size={24} /></span>
            <div>
              <b>Настройка семьи</b>
              <small>Шаг после регистрации</small>
            </div>
          </div>

          <h1>Семейный профиль</h1>
          <p className="muted">
            Первый участник создаёт семью и передаёт код второму. Второй регистрируется со своей почтой и вводит этот код.
          </p>

          <label>
            Ваше имя
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Например, Анна"
            />
          </label>

          <label>
            Название семьи
            <input
              value={familyName}
              onChange={e => setFamilyName(e.target.value)}
            />
          </label>

          <button
            className="primary full"
            disabled={busy}
            onClick={() => setupFamily(false)}
          >
            Создать новую семью
          </button>

          <div className="separator">или присоединиться</div>

          <label>
            Код приглашения
            <input
              value={familyCode}
              onChange={e => setFamilyCode(e.target.value.toUpperCase())}
              placeholder="Например, AB12CD34"
            />
          </label>

          <button
            className="secondary full"
            disabled={busy || !familyCode.trim()}
            onClick={() => setupFamily(true)}
          >
            Присоединиться по коду
          </button>

          <button className="link full" onClick={() => supabase.auth.signOut()}>
            <LogOut size={15} /> Выйти
          </button>

          {message && <p className="notice">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon"><Wallet size={23} /></span>
          <div>
            <b>FinFamily</b>
            <small>Семейный кабинет · BYN</small>
          </div>
        </div>

        <div className="top-actions">
          <span className="sync"><span /> Облако</span>
          <button
            className="icon-btn"
            title="Обновить"
            onClick={() => loadOperations(profile.family_id)}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="icon-btn"
            title="Выйти"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <div className="dashboard-layout">
        <aside className="sidebar">
          <p className="eyebrow">МЕНЮ</p>

          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={18} /> Обзор
          </button>

          <button
            className={tab === "operations" ? "active" : ""}
            onClick={() => setTab("operations")}
          >
            <ReceiptText size={18} /> Операции
          </button>

          <div style={{ marginTop: 28 }}>
            <p className="eyebrow">ВАША СЕМЬЯ</p>
            <div className="member-row">
              <div>
                <b>{familyName}</b>
                <small>{profile.display_name}</small>
              </div>
              <Users size={19} />
            </div>
          </div>

          <div className="family-code">
            <div>
              <small>Код приглашения</small>
              <b>{inviteCode || "Загрузка..."}</b>
            </div>
            <button
              className="icon-btn"
              disabled={!inviteCode}
              onClick={copyInviteCode}
              title="Копировать код"
            >
              <Copy size={15} />
            </button>
          </div>
        </aside>

        <section className="dashboard-main">
          <div className="panel-head">
            <div>
              <p className="eyebrow" style={{ color: "#849088" }}>
                СЕМЕЙНЫЙ ФИНАНСОВЫЙ КАБИНЕТ
              </p>
              <h2 style={{ fontSize: 21 }}>
                Привет, {profile.display_name}!
              </h2>
              <p>Вот что происходит с бюджетом вашей семьи</p>
            </div>

            <button
              className="primary"
              onClick={() => {
                setTab("operations");
                setShowForm(true);
              }}
            >
              <Plus size={17} /> Добавить
            </button>
          </div>

          {message && <p className="notice">{message}</p>}

          <section className="hero">
            <div>
              <p className="eyebrow">ТЕКУЩИЙ БАЛАНС СЕМЬИ</p>
              <h1>{money(balance)}</h1>
              <p className="hero-sub">
                Полученные доходы минус оплаченные расходы
              </p>
            </div>

            <div className="hero-icon"><Wallet size={30} /></div>

            <div className="hero-stats">
              <div>
                <span><ArrowUpRight size={13} /> Доходы получены</span>
                <b>{money(income)}</b>
              </div>
              <div>
                <span><ArrowDownRight size={13} /> Расходы оплачены</span>
                <b>{money(spent)}</b>
              </div>
              <div>
                <span><CalendarDays size={13} /> Ожидают оплаты</span>
                <b>{money(pending)}</b>
              </div>
            </div>
          </section>

          <nav className="tabs">
            <button
              className={tab === "overview" ? "active" : ""}
              onClick={() => setTab("overview")}
            >
              Обзор
            </button>
            <button
              className={tab === "operations" ? "active" : ""}
              onClick={() => setTab("operations")}
            >
              Все операции
            </button>
          </nav>

          {tab === "overview" ? (
            <div className="content-grid">
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Структура расходов</h2>
                    <p>Оплаченные расходы по категориям</p>
                  </div>
                </div>

                {pie.length ? (
                  <div className="chart">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={pie}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="48%"
                          outerRadius={92}
                          labelLine
                          label={({ name, percent }) =>
                            `${name} ${(Number(percent) * 100).toFixed(1)}%`
                          }
                        >
                          {pie.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={colors[index % colors.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => money(Number(v))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="empty">
                    Добавьте оплаченные расходы, чтобы увидеть диаграмму.
                  </div>
                )}

                <p className="chart-note">
                  Диаграмма показывает долю каждой категории в сумме оплаченных расходов.
                </p>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Участники семьи</h2>
                    <p>Финансовый вклад каждого участника</p>
                  </div>
                  <Users size={20} />
                </div>

                {memberStats.length ? (
                  memberStats.map(m => (
                    <div className="member-row" key={m.name}>
                      <div>
                        <b>{m.name}</b>
                        <small>
                          Доходы {money(m.income)} · Расходы {money(m.expenses)}
                        </small>
                      </div>
                      <strong>{money(m.income - m.expenses)}</strong>
                    </div>
                  ))
                ) : (
                  <div className="empty">Пока нет операций.</div>
                )}

                <div className="family-code">
                  <div>
                    <small>Код для второго участника</small>
                    <b>{inviteCode || "Код загружается..."}</b>
                  </div>
                  <button
                    className="secondary"
                    disabled={!inviteCode}
                    onClick={copyInviteCode}
                  >
                    <Copy size={15} /> Копировать
                  </button>
                </div>

                <p className="tiny">
                  Передавайте код только члену своей семьи.
                </p>
              </section>

              <section className="panel wide">
                <div className="panel-head">
                  <div>
                    <h2>Последние операции</h2>
                    <p>Недавние движения семейного бюджета</p>
                  </div>

                  <button
                    className="secondary"
                    onClick={() => setTab("operations")}
                  >
                    Все операции
                  </button>
                </div>

                {operations.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Операция</th>
                          <th>Участник</th>
                          <th>Дата</th>
                          <th>Сумма</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operations.slice(0, 5).map(op => (
                          <tr key={op.id}>
                            <td>
                              <b>{op.title}</b>
                              <small>
                                {op.category || (op.kind === "income" ? "Доход" : op.kind === "mandatory" ? "Обязательный платёж" : op.kind === "shared" ? "Общий расход" : "Личный расход")}
                              </small>
                            </td>
                            <td>{op.member_name}</td>
                            <td>{formatDate(op.operation_date)}</td>
                            <td className={op.kind === "income" ? "positive" : "negative"}>
                              {op.kind === "income" ? "+" : "−"}
                              {money(Number(op.amount))}
                            </td>
                            <td>
                              <span className={op.settled ? "status done" : "status pending"}>
                                {op.settled
                                  ? op.kind === "income" ? "Получено" : "Оплачено"
                                  : "Ожидает"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty">
                    Операций пока нет. Добавьте первую запись.
                  </div>
                )}
              </section>

              <section className="panel wide">
                <div className="panel-head">
                  <div>
                    <h2>Быстрая сводка</h2>
                    <p>Только подтверждённые операции влияют на баланс</p>
                  </div>
                </div>

                <div className="summary-grid">
                  <div>
                    <TrendingUp />
                    <span>Получено</span>
                    <b>{money(income)}</b>
                  </div>
                  <div>
                    <TrendingDown />
                    <span>Потрачено</span>
                    <b>{money(spent)}</b>
                  </div>
                  <div>
                    <CalendarDays />
                    <span>К оплате</span>
                    <b>{money(pending)}</b>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <section className="panel operations-panel">
              <div className="panel-head">
                <div>
                  <h2>История операций</h2>
                  <p>
                    Добавляйте доходы и расходы, отмечайте факт получения или оплаты
                  </p>
                </div>

                <button
                  className="primary"
                  onClick={() => setShowForm(!showForm)}
                >
                  <Plus size={17} /> Добавить
                </button>
              </div>

              {showForm && (
                <div className="form-grid">
                  <label>
                    Название
                    <input
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                      placeholder="Продукты, зарплата…"
                    />
                  </label>

                  <label>
                    Тип
                    <select
                      value={kind}
                      onChange={e => { const nextKind = e.target.value as Operation["kind"]; setKind(nextKind); setCategory(nextKind === "income" ? "Зарплата" : "Продукты"); }}
                    >
                      <option value="income">Доход</option>
                      <option value="mandatory">Обязательный платёж</option>
                      <option value="shared">Общий расход</option>
                      <option value="personal">Личный расход</option>
                    </select>
                  </label>

                  <label>
                    Категория
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                    >
                      {(kind === "income"
                        ? ["Зарплата", "Премия", "Подработка", "Подарки", "Другое"]
                        : ["Продукты", "Жильё и коммунальные услуги", "Транспорт", "Здоровье", "Одежда", "Развлечения", "Покупки для дома", "Обязательные платежи", "Другое"]
                      ).map(item => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Сумма, BYN
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0,00"
                    />
                  </label>

                  <label>
                    Дата
                    <input
                      type="date"
                      value={date}
                      onChange={e => setDate(e.target.value)}
                    />
                  </label>

                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={settled}
                      onChange={e => setSettled(e.target.checked)}
                    />
                    {kind === "income"
                      ? "Доход уже получен"
                      : "Расход уже оплачен"}
                  </label>

                  <button
                    className="primary form-submit"
                    disabled={!title.trim() || Number(amount) <= 0 || busy}
                    onClick={addOperation}
                  >
                    Сохранить
                  </button>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Операция</th>
                      <th>Участник</th>
                      <th>Дата</th>
                      <th>Сумма</th>
                      <th>Статус</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {operations.map(op => (
                      <tr key={op.id}>
                        <td>
                          <b>{op.title}</b>
                          <small>
                            {op.category || (op.kind === "income" ? "Доход" : op.kind === "mandatory" ? "Обязательный платёж" : op.kind === "shared" ? "Общий расход" : "Личный расход")}
                          </small>
                        </td>

                        <td>{op.member_name}</td>
                        <td>{formatDate(op.operation_date)}</td>

                        <td className={op.kind === "income" ? "positive" : "negative"}>
                          {op.kind === "income" ? "+" : "−"}
                          {money(Number(op.amount))}
                        </td>

                        <td>
                          <button
                            className={op.settled ? "status done" : "status pending"}
                            onClick={() => toggleSettled(op)}
                          >
                            {op.settled
                              ? <CheckCircle2 size={15} />
                              : <Circle size={15} />}
                            {op.settled
                              ? op.kind === "income" ? "Получено" : "Оплачено"
                              : "Ожидает"}
                          </button>
                        </td>

                        <td>
                          <button
                            className="icon-btn danger"
                            onClick={() => deleteOperation(op.id)}
                            title="Удалить"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!operations.length && (
                  <div className="empty">
                    Операций пока нет. Добавьте первую запись.
                  </div>
                )}
              </div>
            </section>
          )}
        </section>
      </div>

      <nav className="mobile-nav">
        <button
          className={tab === "overview" ? "active" : ""}
          onClick={() => setTab("overview")}
        >
          <LayoutDashboard size={19} />
          Обзор
        </button>

        <button
          className={tab === "operations" ? "active" : ""}
          onClick={() => setTab("operations")}
        >
          <ReceiptText size={19} />
          Операции
        </button>

        <button
          onClick={() => {
            setTab("operations");
            setShowForm(true);
          }}
        >
          <Plus size={19} />
          Добавить
        </button>
      </nav>

      <footer>
        FinFamily · Семейные финансы · Данные синхронизируются через Supabase
      </footer>
    </main>
  );
}
