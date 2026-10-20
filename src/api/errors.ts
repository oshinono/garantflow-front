/** Русские тексты для кодов ошибок API (раздел 15 api.md, восстановлен по ТЗ). */
export const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Не удалось войти. Проверьте почту и пароль.",
  email_not_verified: "Почта ещё не подтверждена.",
  user_inactive: "Аккаунт заблокирован.",
  email_already_registered: "Аккаунт с такой почтой уже существует. Попробуйте войти.",
  invalid_refresh_token: "Сессия истекла. Войдите снова.",
  invalid_email_verification_token: "Ссылка недействительна или устарела.",
  too_many_login_attempts: "Слишком много попыток. Попробуйте позже.",
  permission_denied: "Недостаточно прав.",
  workspace_not_found: "Воркспейс не найден или у вас нет доступа.",
  user_not_found: "Пользователь не найден.",
  member_not_found: "Участник не найден.",
  client_not_found: "Клиент не найден.",
  bank_not_found: "Банк не найден.",
  procurement_not_found: "Закупка не найдена.",
  application_not_found: "Заявка не найдена.",
  bank_request_not_found: "Запрос в банк не найден.",
  guarantee_not_found: "Гарантия не найдена.",
  invitation_not_found: "Приглашение не найдено или уже использовано.",
  invalid_status_transition: "Такой переход статуса недоступен.",
  application_archived: "Заявка в архиве. Верните её в работу, чтобы изменить.",
  client_archived: "Клиент в архиве — выберите другого.",
  client_in_use: "Клиента нельзя удалить: по нему есть заявки.",
  procurement_in_use: "Закупку нельзя удалить: по ней есть заявки.",
  procurement_archived: "Закупка в архиве.",
  bank_inactive: "Банк неактивен.",
  bank_request_has_guarantee: "По этому банку уже оформлена выдача — сначала удалите данные о выдаче.",
  guarantee_limit_exceeded: "По этой заявке нельзя добавить ещё одну гарантию.",
  guarantee_bank_already_used: "Гарантия этого банка по заявке уже внесена.",
  guarantee_already_issued: "Гарантия уже выдана — изменение недоступно.",
  invitation_email_mismatch: "Приглашение отправлено на другой адрес почты.",
  invitation_expired: "Срок действия приглашения истёк.",
  invitation_not_pending: "Приглашение уже нельзя изменить.",
  member_already_exists: "Этот пользователь уже состоит в воркспейсе.",
  bank_already_exists: "Банк с таким названием уже есть.",
  data_conflict: "Такая запись уже существует.",
  invalid_procurement: "Проверьте данные закупки.",
  invalid_money_amount: "Некорректная сумма.",
  invalid_application: "Проверьте данные заявки.",
  domain_error: "Операция недопустима в текущем состоянии.",
  internal_error: "Внутренняя ошибка сервера.",
  validation_error: "Проверьте правильность заполнения полей.",
};

export type ValidationIssue = { loc: (string | number)[]; msg: string; type: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly detail: string | null;
  readonly issues: ValidationIssue[];
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(init: {
    status: number;
    code?: string | null;
    detail?: string | null;
    issues?: ValidationIssue[];
    requestId?: string | null;
    retryAfter?: number | null;
  }) {
    super(init.detail ?? init.code ?? `HTTP ${init.status}`);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code ?? null;
    this.detail = init.detail ?? null;
    this.issues = init.issues ?? [];
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }

  get isNetwork() {
    return this.status === 0;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** Текст ошибки для пользователя: словарь по code, иначе detail, иначе общий. */
export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.isNetwork) return "Сеть недоступна. Проверьте подключение.";
    if (e.code && ERROR_MESSAGES[e.code]) return ERROR_MESSAGES[e.code]!;
    if (e.status === 403) return ERROR_MESSAGES.permission_denied!;
    if (e.status === 422 && e.issues.length) return ERROR_MESSAGES.validation_error!;
    if (e.status >= 500) return `Ошибка сервера. Код запроса для поддержки: ${e.requestId ?? "—"}`;
    if (e.detail) return e.detail;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Что-то пошло не так.";
}

/** 422 FastAPI: detail[].loc → имя поля (последний строковый сегмент). */
export function fieldErrors(e: unknown): Record<string, string> {
  if (!isApiError(e) || !e.issues.length) return {};
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const field = [...issue.loc].reverse().find((x): x is string => typeof x === "string" && x !== "body");
    if (field && !out[field]) out[field] = issue.msg;
  }
  return out;
}

export async function toApiError(response: Response, body: unknown): Promise<ApiError> {
  const requestId = response.headers.get("X-Request-ID");
  const retry = Number(response.headers.get("Retry-After"));
  let code: string | null = null;
  let detail: string | null = null;
  let issues: ValidationIssue[] = [];
  if (body && typeof body === "object") {
    const b = body as { code?: unknown; detail?: unknown };
    if (typeof b.code === "string") code = b.code;
    if (typeof b.detail === "string") detail = b.detail;
    else if (Array.isArray(b.detail)) issues = b.detail as ValidationIssue[];
  }
  if (response.status === 429 && !code) code = "too_many_login_attempts";
  return new ApiError({
    status: response.status,
    code,
    detail,
    issues,
    requestId,
    retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
  });
}
