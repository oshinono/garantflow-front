import type { components } from "@/api/schema";

type S = components["schemas"];

export type DbUser = S["UserResponse"] & { password: string };
export type DbMember = S["WorkspaceMember"] & { workspace_id: string; joined_at: string };
export type DbClient = S["ClientRequest"] & {
  id: string;
  workspace_id: string;
  is_archived: boolean;
  created_at: string;
};
export type DbBank = S["BankResponse"] & { workspace_id: string | null };
export type DbInvitation = {
  id: string;
  workspace_id: string;
  email: string;
  role: S["MemberRole"];
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  token: string;
};
export type DbApplication = S["ApplicationFields"] & {
  id: string;
  workspace_id: string;
  client_id: string;
  status: S["ApplicationStatus"];
  created_at: string;
  updated_at: string;
  created_by_user_id: string | null;
  status_history: S["StatusHistoryEntry"][];
  archive_reason: string | null;
  client_obtained_independently: boolean | null;
};
export type DbGuarantee = S["GuaranteeResponse"] & { bank_id: string | null };
export type MailItem = { to: string; subject: string; link: string; at: string };

export type Db = {
  users: DbUser[];
  verifyTokens: { token: string; userId: string }[];
  refreshTokens: { token: string; userId: string }[];
  accessTokens: { token: string; userId: string; exp: number }[];
  workspaces: { id: string; name: string; owner_id: string; created_at: string }[];
  members: DbMember[];
  invitations: DbInvitation[];
  banks: DbBank[];
  clients: DbClient[];
  procurements: S["ProcurementResponse"][];
  applications: DbApplication[];
  bankRequests: S["BankRequestResponse"][];
  guarantees: DbGuarantee[];
  mailbox: MailItem[];
  seq: Record<string, number>;
  loginFailures: Record<string, number[]>;
};

const KEY = "mock:db:v1";

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

export const nowIso = () => new Date().toISOString();

const persistent = typeof window !== "undefined" && typeof localStorage !== "undefined";

let db: Db | null = null;

export function getDb(): Db {
  if (db) return db;
  if (persistent) {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        db = JSON.parse(raw) as Db;
        return db;
      }
    } catch {
      /* испорченные данные — пересоздаём */
    }
  }
  db = seedDb();
  saveDb();
  return db;
}

export function saveDb() {
  if (!persistent || !db) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* переполнено */
  }
}

export function resetDb(next?: Db) {
  db = next ?? seedDb();
  saveDb();
}

/* ------------------------------------------------------------------ seed */

const day = 864e5;
const isoDay = (offset: number) => new Date(Date.now() + offset * day).toISOString().slice(0, 10);
const deadline = (offset: number) => {
  const d = new Date(Date.now() + offset * day);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
};
const stamp = (offsetDays: number, h = 10, m = 0) => {
  const d = new Date(Date.now() + offsetDays * day);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const DEMO_PASSWORD = "demo12345";
export const DEMO_EMAIL = "demo@garant.local";

export type SeedStubs = {
  wsId: string;
  comments: {
    id: string;
    applicationId: string;
    bankRequestId: string;
    text: string;
    authorId: string;
    authorName: string;
    createdAt: string;
  }[];
  primaryBanks: Record<string, string>;
  offers: Record<string, { rate: string; fee: string; days: string; cond: string }>;
  bankInfo: Record<string, { limit: string; until: string; contact: string }>;
};

export let lastSeedStubs: SeedStubs | null = null;

function seedDb(): Db {
  const created = stamp(-60);
  const user = (full_name: string, email: string): DbUser => ({
    id: uuid(),
    full_name,
    email,
    is_active: true,
    email_verified: true,
    password: DEMO_PASSWORD,
  });
  const demo = user("Демо-пользователь", DEMO_EMAIL);
  const maria = user("Мария Кузнецова", "maria@garant.local");
  const alexey = user("Алексей Смирнов", "alexey@garant.local");
  const dmitry = user("Дмитрий Орлов", "dmitry@garant.local");
  const ws = { id: uuid(), name: "Демо-воркспейс", owner_id: demo.id, created_at: created };
  const ws2 = { id: uuid(), name: "Корпоративные клиенты", owner_id: maria.id, created_at: created };

  const members: DbMember[] = [
    { user_id: demo.id, workspace_id: ws.id, role: "OWNER", joined_at: created },
    { user_id: maria.id, workspace_id: ws.id, role: "ADMIN", joined_at: created },
    { user_id: alexey.id, workspace_id: ws.id, role: "MEMBER", joined_at: created },
    { user_id: dmitry.id, workspace_id: ws.id, role: "MEMBER", joined_at: created },
    { user_id: maria.id, workspace_id: ws2.id, role: "OWNER", joined_at: created },
    { user_id: demo.id, workspace_id: ws2.id, role: "MEMBER", joined_at: created },
  ];

  const bank = (name: string, global: boolean, workspaceId: string | null = null, active = true): DbBank => ({
    id: uuid(),
    name,
    is_global: global,
    is_active: active,
    workspace_id: workspaceId,
    created_at: created,
    updated_at: created,
  });
  const bA = bank("Банк А", true);
  const bB = bank("Банк Б", true);
  const bV = bank("Банк В", true);
  const bG = bank("Банк Город", false, ws.id, false);

  const d: Db = {
    users: [demo, maria, alexey, dmitry],
    verifyTokens: [],
    refreshTokens: [],
    accessTokens: [],
    workspaces: [ws, ws2],
    members,
    invitations: [
      {
        id: uuid(),
        workspace_id: ws.id,
        email: "olga@garant.local",
        role: "MEMBER",
        created_at: stamp(-2),
        expires_at: stamp(5),
        accepted_at: null,
        token: uuid(),
      },
    ],
    banks: [bA, bB, bV, bG],
    clients: [],
    procurements: [],
    applications: [],
    bankRequests: [],
    guarantees: [],
    mailbox: [],
    seq: {},
    loginFailures: {},
  };

  const stubs: SeedStubs = {
    wsId: ws.id,
    comments: [],
    primaryBanks: {},
    offers: {},
    bankInfo: {
      [bA.id]: { limit: "3000000", until: isoDay(120), contact: "Ирина, +7 900 000-00-01" },
      [bV.id]: { limit: "1500000", until: isoDay(-3), contact: "Олег, corporate@bank-v.example" },
    },
  };

  type Req = {
    bank: typeof bA;
    state: "pending" | "approved" | "rejected";
    comment?: [string, DbUser, number];
    offer?: { rate: string; fee: string; days: string; cond: string };
    reason?: string;
  };
  type Iss = { bank: typeof bA; date: number; amount: string; comm: string; rate: string };
  type Seed = {
    name: string;
    inn: string;
    law: S["ProcurementLawType"] | "vat";
    type: S["GuaranteeType"];
    amount: string;
    status: S["ApplicationStatus"];
    reg?: string;
    nmc?: string;
    opz?: number;
    customer?: [string, string];
    contract?: [string, string];
    owner?: DbUser;
    primary?: typeof bA;
    reqs?: Req[];
    issued?: Iss[];
    self?: boolean | null;
    validDays?: number;
  };

  const seeds: Seed[] = [
    {
      name: "ООО Ромашка",
      inn: "7701234567",
      law: "44_fz",
      reg: "0173200001425000123",
      nmc: "5000000",
      type: "participation",
      opz: 1,
      amount: "50000",
      status: "in_progress",
      owner: demo,
      primary: bA,
      validDays: 90,
      reqs: [
        {
          bank: bA,
          state: "pending",
          comment: ["Запросили баланс за последний квартал.", maria, -2],
          offer: { rate: "2.4", fee: "1200", days: "2", cond: "Без обеспечения" },
        },
        {
          bank: bB,
          state: "pending",
          comment: ["Рассматривает, ответ обещают до конца недели.", alexey, -1],
          offer: { rate: "2.9", fee: "1450", days: "1", cond: "Нужна выписка 51 счёта" },
        },
      ],
    },
    {
      name: "ИП Иванов",
      inn: "772200111222",
      law: "commercial",
      customer: ["ООО Заказчик", "7707000001"],
      contract: ["Д-15", isoDay(-18)],
      type: "advance",
      amount: "1000000",
      status: "issued",
      owner: maria,
      primary: bB,
      validDays: 180,
      reqs: [
        { bank: bB, state: "approved" },
        { bank: bA, state: "approved" },
      ],
      issued: [
        { bank: bB, date: -14, amount: "600000", comm: "12000", rate: "30" },
        { bank: bA, date: -13, amount: "400000", comm: "8000", rate: "25" },
      ],
    },
    {
      name: "ООО Вега",
      inn: "7703999888",
      law: "vat",
      type: "vat",
      amount: "900000",
      status: "archived",
      primary: bV,
      self: true,
      validDays: 90,
      reqs: [
        {
          bank: bV,
          state: "rejected",
          reason: "Нет лимита на клиента",
          comment: ["Отказ: нет лимита.", dmitry, -20],
        },
      ],
    },
    {
      name: "ООО СтройМонтаж",
      inn: "7812456701",
      law: "44_fz",
      reg: "0173200001426000412",
      nmc: "4200000",
      type: "participation",
      opz: 10,
      amount: "420000",
      status: "in_progress",
      owner: maria,
      primary: bA,
      validDays: 120,
      reqs: [
        {
          bank: bA,
          state: "pending",
          comment: ["Запросили бухгалтерский баланс за последний квартал.", maria, -7],
        },
        { bank: bB, state: "pending", comment: ["Первичная проверка документов.", alexey, -6] },
      ],
    },
    {
      name: "ООО СеверТех",
      inn: "7805123490",
      law: "commercial",
      customer: ["АО Северный терминал", "7801002003"],
      contract: ["К-208", isoDay(-11)],
      type: "go",
      amount: "2200000",
      status: "in_progress",
      primary: bV,
      validDays: 365,
      reqs: [
        { bank: bV, state: "pending", comment: ["Ожидаем согласование индивидуальной ставки.", dmitry, -6] },
      ],
    },
    {
      name: "ООО АльфаСнаб",
      inn: "7712345609",
      law: "44_fz",
      reg: "0373100001126000931",
      nmc: "3400000",
      type: "oik",
      opz: -17,
      amount: "850000",
      status: "issued",
      owner: maria,
      primary: bA,
      validDays: 90,
      reqs: [
        {
          bank: bA,
          state: "approved",
          comment: ["Гарантия выдана, документы направлены клиенту.", maria, -11],
        },
      ],
      issued: [{ bank: bA, date: -11, amount: "850000", comm: "17000", rate: "25" }],
    },
    {
      name: "ООО Меридиан",
      inn: "5038124670",
      law: "223_fz",
      reg: "326123456789012",
      nmc: "6800000",
      type: "participation",
      opz: -19,
      amount: "2400000",
      status: "issued",
      owner: dmitry,
      primary: bV,
      validDays: 180,
      reqs: [
        { bank: bV, state: "approved", comment: ["Выдана гарантия на согласованных условиях.", dmitry, -7] },
      ],
      issued: [{ bank: bV, date: -7, amount: "2400000", comm: "42000", rate: "20" }],
    },
    {
      name: "ООО ВекторКом",
      inn: "7728456012",
      law: "commercial",
      customer: ["ООО Городские сети", "7703456002"],
      contract: ["ВК-91", isoDay(-31)],
      type: "advance",
      amount: "680000",
      status: "issued",
      owner: alexey,
      primary: bB,
      validDays: 180,
      reqs: [
        {
          bank: bB,
          state: "approved",
          comment: ["Комиссия и вознаграждение подтверждены для сверки.", alexey, -27],
        },
      ],
      issued: [{ bank: bB, date: -27, amount: "680000", comm: "13600", rate: "25" }],
    },
    {
      name: "ООО Гранит",
      inn: "6670482910",
      law: "vat",
      type: "vat",
      amount: "1400000",
      status: "archived",
      primary: bV,
      self: false,
      validDays: 90,
      reqs: [
        {
          bank: bV,
          state: "rejected",
          reason: "Лимит исчерпан",
          comment: ["Отказ по лимиту. Клиент рассматривает альтернативный банк.", dmitry, -17],
        },
      ],
    },
    {
      name: "ИП Петров",
      inn: "590412345678",
      law: "223_fz",
      reg: "326123456789018",
      nmc: "1800000",
      type: "participation",
      opz: 2,
      amount: "180000",
      status: "in_progress",
      owner: alexey,
      primary: bB,
      validDays: 60,
      reqs: [
        {
          bank: bB,
          state: "pending",
          comment: ["Документы переданы на скоринг. @Демо-пользователь, проверьте доверенность.", maria, -1],
        },
      ],
    },
    {
      name: "ООО АстраЛогистик",
      inn: "5257183046",
      law: "44_fz",
      reg: "0132200000326000071",
      nmc: "9500000",
      type: "go",
      opz: -60,
      amount: "1800000",
      status: "issued",
      owner: alexey,
      primary: bA,
      validDays: 365,
      reqs: [
        { bank: bA, state: "approved", comment: ["Выдача завершена, акт сверки подготовлен.", alexey, -52] },
      ],
      issued: [{ bank: bA, date: -52, amount: "1800000", comm: "36000", rate: "22" }],
    },
    {
      name: "ООО Новатор",
      inn: "5406981234",
      law: "44_fz",
      reg: "0151300000426001200",
      nmc: "2750000",
      type: "oik",
      opz: -8,
      amount: "310000",
      status: "archived",
      primary: bB,
      self: true,
      validDays: 90,
      reqs: [
        { bank: bB, state: "pending", comment: ["Клиент выпустил гарантию самостоятельно.", maria, -9] },
      ],
    },
  ];

  seeds.forEach((s, idx) => {
    const createdAt = stamp(-40 + idx * 2, 9 + (idx % 6), 15);
    const client: DbClient = {
      id: uuid(),
      workspace_id: ws.id,
      name: s.name,
      inn: s.inn,
      client_type: s.inn.length === 12 ? "ip" : "company",
      is_archived: false,
      created_at: createdAt,
    };
    d.clients.push(client);
    let procurementId: string | null = null;
    if (s.law !== "vat") {
      const p: S["ProcurementResponse"] = {
        id: uuid(),
        workspace_id: ws.id,
        created_at: createdAt,
        updated_at: createdAt,
        client_id: client.id,
        law_type: s.law,
        name: s.reg ?? s.name,
        registry_number: s.reg ?? null,
        placement_url: s.reg
          ? "https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=" + s.reg
          : null,
        nmc: s.nmc ?? null,
        application_deadline: s.opz != null ? deadline(s.opz) : null,
        customer_name: s.customer?.[0] ?? null,
        customer_inn: s.customer?.[1] ?? null,
        contract_number: s.contract?.[0] ?? null,
        contract_date: s.contract?.[1] ?? null,
      };
      d.procurements.push(p);
      procurementId = p.id;
    }
    const validFrom = isoDay(-30 + idx);
    const app: DbApplication = {
      id: uuid(),
      workspace_id: ws.id,
      number: String(idx + 1),
      status: s.status,
      created_at: createdAt,
      updated_at: createdAt,
      created_by_user_id: demo.id,
      client_id: client.id,
      procurement_id: procurementId,
      guarantee_type: s.type,
      beneficiary_name: s.law === "vat" ? "ФНС" : null,
      beneficiary_inn: s.law === "vat" ? "7707329152" : null,
      requested_amount: s.amount,
      requested_valid_from: validFrom,
      requested_valid_to: isoDay(-30 + idx + (s.validDays ?? 90)),
      responsible_user_id: s.owner?.id ?? null,
      description: null,
      status_history: [
        {
          from_status: null,
          to_status: "in_progress",
          changed_at: createdAt,
          changed_by_user_id: demo.id,
          comment: null,
        },
      ],
      archive_reason: null,
      client_obtained_independently: null,
    };
    d.applications.push(app);
    if (s.primary) stubs.primaryBanks[app.id] = s.primary.id;

    for (const r of s.reqs ?? []) {
      const br: S["BankRequestResponse"] = {
        id: uuid(),
        application_id: app.id,
        bank_id: r.bank.id,
        external_number: null,
        requested_amount: s.amount,
        sent_at: stamp(-30 + idx * 2),
        decision_at: r.state === "pending" ? null : stamp(-28 + idx * 2),
        offer_received: r.state === "approved" ? true : r.state === "rejected" ? false : null,
        rejection_reason: r.reason ?? null,
        notes: null,
        created_at: createdAt,
        updated_at: createdAt,
      };
      d.bankRequests.push(br);
      if (r.comment) {
        const [text, author, off] = r.comment;
        stubs.comments.push({
          id: uuid(),
          applicationId: app.id,
          bankRequestId: br.id,
          text,
          authorId: author.id,
          authorName: author.full_name,
          createdAt: stamp(off, 11, 40),
        });
      }
      if (r.offer) stubs.offers[br.id] = r.offer;
      const iss = s.issued?.find((i) => i.bank.id === r.bank.id);
      if (iss) {
        d.guarantees.push({
          id: uuid(),
          application_id: app.id,
          bank_id: r.bank.id,
          bank_request_id: br.id,
          created_at: stamp(iss.date),
          guarantee_number: `БГ-${100 + idx}-${r.bank.name.slice(-1)}`,
          issued_at: isoDay(iss.date),
          amount: iss.amount,
          valid_from: isoDay(iss.date),
          valid_to: isoDay(iss.date + (s.validDays ?? 90)),
          bank_commission_amount: iss.comm,
          agent_commission_rate: iss.rate,
          agent_commission_amount: ((Number(iss.comm) * Number(iss.rate)) / 100).toFixed(2),
          agent_commission_is_manual: false,
          notes: null,
        });
      }
    }
    if (s.status === "issued") {
      const at = stamp(s.issued?.[0]?.date ?? -1, 16, 20);
      app.status_history.push({
        from_status: "in_progress",
        to_status: "issued",
        changed_at: at,
        changed_by_user_id: s.owner?.id ?? demo.id,
        comment: null,
      });
    }
    if (s.status === "archived") {
      const at = stamp(-15 + idx, 15, 45);
      app.status_history.push({
        from_status: "in_progress",
        to_status: "archived",
        changed_at: at,
        changed_by_user_id: maria.id,
        comment: s.self ? "Клиент получил БГ самостоятельно" : "Отказ банков",
      });
      app.archive_reason = s.self ? "Клиент получил БГ самостоятельно" : "Отказ банков";
      app.client_obtained_independently = s.self ?? null;
    }
  });
  d.seq[ws.id] = seeds.length;

  // Небольшой второй воркспейс, где демо-пользователь — обычный участник.
  const c2: DbClient = {
    id: uuid(),
    workspace_id: ws2.id,
    name: "АО ТрансЭнерго",
    inn: "7708123456",
    client_type: "company",
    is_archived: false,
    created_at: created,
  };
  const p2: S["ProcurementResponse"] = {
    id: uuid(),
    workspace_id: ws2.id,
    created_at: created,
    updated_at: created,
    client_id: c2.id,
    law_type: "223_fz",
    name: "32614500111",
    registry_number: "32614500111",
    placement_url: "https://zakupki.gov.ru/",
    nmc: "12000000",
    application_deadline: deadline(5),
    customer_name: null,
    customer_inn: null,
    contract_number: null,
    contract_date: null,
  };
  d.clients.push(c2);
  d.procurements.push(p2);
  d.applications.push({
    id: uuid(),
    workspace_id: ws2.id,
    number: "1",
    status: "in_progress",
    created_at: created,
    updated_at: created,
    created_by_user_id: maria.id,
    client_id: c2.id,
    procurement_id: p2.id,
    guarantee_type: "participation",
    beneficiary_name: null,
    beneficiary_inn: null,
    requested_amount: "600000",
    requested_valid_from: null,
    requested_valid_to: null,
    responsible_user_id: maria.id,
    description: null,
    status_history: [
      {
        from_status: null,
        to_status: "in_progress",
        changed_at: created,
        changed_by_user_id: maria.id,
        comment: null,
      },
    ],
    archive_reason: null,
    client_obtained_independently: null,
  });
  d.seq[ws2.id] = 1;

  lastSeedStubs = stubs;
  return d;
}
