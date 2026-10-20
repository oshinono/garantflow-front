# Спецификация HTTP API (Garant Flow)

Контракт текущего бэкенда. Источник истины — код в `backend/src/entrypoints/api/`.
Интерактивная схема: `/docs`, машиночитаемая — `/openapi.json`.

Базовый префикс бизнес-маршрутов: **`/api/v1`**.  
`/health`, `/metrics`, `/docs` — без версии.

---

## 1. Общие соглашения

### Авторизация

- Схема: `Authorization: Bearer <access_token>` (OAuth2 Password Bearer).
- `tokenUrl` для формы логина: `/api/v1/auth/login`.
- Невалидный / отозванный access или неактивный пользователь → **401** + заголовок `WWW-Authenticate: Bearer`.

### Заголовки

| Заголовок | Направление | Описание |
|-----------|-------------|----------|
| `Authorization` | запрос | Bearer access-токен (где требуется) |
| `X-Request-ID` | запрос / ответ | Опционально на входе; на выходе всегда (переданное или сгенерированное) |
| `Retry-After` | ответ | Секунды до следующей попытки при **429** на логине |
| `WWW-Authenticate` | ответ | `Bearer` при **401** `invalid_credentials` и при отказе `get_current_user` |

### Формат ошибок

```json
{"detail": "человекочитаемое сообщение", "code": "machine_code"}
```

Ошибки валидации Pydantic/FastAPI — стандартный **422** FastAPI (без поля `code` в том же формате).

### Деньги и время

- Суммы (`Decimal`): не более **2** знаков после запятой (проверяет домен → `invalid_money_amount` / 422).
- `datetime` в закупках и заявках в банк — с часовым поясом (домен).

### Пагинация и файлы

- Пагинации нет: списки отдаются целиком.
- Загрузки файлов (сканы БГ и т.п.) в API нет.

---

## 2. Аутентификация и токены

| Параметр | Значение по умолчанию | Env |
|----------|----------------------|-----|
| Алгоритм JWT | HS256 | `AUTH_ALGORITHM` |
| Access TTL | 30 мин (`expires_in` = 1800) | `AUTH_ACCESS_TOKEN_TTL_MINUTES` |
| Refresh TTL | 30 дней | `AUTH_REFRESH_TOKEN_TTL_DAYS` |
| TTL подтверждения email | 24 ч | `AUTH_EMAIL_VERIFICATION_TTL_HOURS` |
| TTL приглашения | 7 дней | `AUTH_INVITATION_TTL_DAYS` |

- **Access** — JWT (`sub`, `jti`, `iat`, `exp`, `type=access`).
- **Refresh** — opaque-строка в Redis; при `POST /auth/refresh` — **одноразовая ротация** (старый токен гасится, выдаётся новая пара).
- **Logout** — гасит refresh; если передан валидный Bearer — `jti` access попадает в denylist на оставшийся TTL. Идемпотентен; Bearer опционален.
- Логин без подтверждённого email → **403** `email_not_verified`.
- Логин неактивного пользователя → **403** `user_inactive`.
- Регистрация без `invitation_token` → письмо подтверждения; с валидным invitation-токеном на тот же email — почта сразу verified.

### Пароль и email

| Поле | Ограничения |
|------|-------------|
| Пароль (регистрация) | 8–128 символов; сложность (цифры/регистр) не проверяется |
| Email (API) | длина 3–320 |
| Email (домен) | trim + lower; regex `^[^@\s]+@[^@\s]+\.[^@\s]+$` → иначе 422 `domain_error` |

---

## 3. Rate limiting

Глобального лимита на API нет. Лимиты только в хендлерах (фиксированное окно Redis).

| Эндпоинт | Лимит | Поведение при превышении |
|----------|-------|--------------------------|
| `POST /api/v1/auth/login` | 5 неудачных / email / 900 с; 20 неудачных / IP / 900 с | **429** `too_many_login_attempts` + `Retry-After` |
| `POST /api/v1/auth/verify-email/resend` | 3 / email / 900 с | Тихий no-op, ответ всё равно **202** |

После успешного логина сбрасывается счётчик по email (не по IP).

Env: `AUTH_LOGIN_WINDOW_SECONDS`, `AUTH_LOGIN_MAX_ATTEMPTS_PER_EMAIL`, `AUTH_LOGIN_MAX_ATTEMPTS_PER_IP`, `AUTH_VERIFICATION_RESEND_WINDOW_SECONDS`, `AUTH_VERIFICATION_RESEND_MAX_PER_EMAIL`.

---

## 4. Роли workspace

Значения: `OWNER` | `ADMIN` | `MEMBER`.

Инварианты:

- Нельзя пригласить или назначить роль `OWNER`.
- Нельзя сменить роль текущего OWNER и нельзя удалить OWNER.
- Создатель workspace становится OWNER.

| Действие | OWNER | ADMIN | MEMBER |
|----------|:-----:|:-----:|:------:|
| Создать workspace | любой authenticated | | |
| Просмотр workspace / списки (банки, закупки, заявки) | + | + | + |
| Clients: create / update | + | + | + |
| Clients: delete / archive / restore | + | + | |
| Banks: create / rename | + | + | + |
| Banks: activate / deactivate | + | + | |
| Procurements: create / update | + | + | + |
| Procurements: delete / archive / restore | + | + | |
| Applications: create / update / archive / reopen | + | + | + |
| Bank requests: add / update; guarantees: issue / update | + | + | + |
| Bank requests / guarantees: delete | + | + | |
| Invite / revoke / list invitations | + | + | |
| Remove member | + | + | |
| Change member role | + | | |

Отказ → **403** `permission_denied`. Не участник workspace → **403** (или 404 ресурса — по конкретной операции).

---

## 5. Перечисления

| Enum | Значения |
|------|----------|
| `MemberRole` | `OWNER`, `ADMIN`, `MEMBER` |
| `ClientType` | `company`, `ip` |
| `ProcurementLawType` | `commercial`, `44_fz`, `223_fz`, `615_pp` |
| `GuaranteeType` | `participation`, `oik`, `go`, `advance`, `vat` |
| `ApplicationStatus` | `in_progress`, `issued`, `archived` |

---

## 6. Health / Metrics

### `GET /health`

- Auth: нет
- Ответ **200**: `{"status": "ok"}`

### `GET /metrics`

- Auth: нет
- Включён только если metrics enabled в конфиге
- Prometheus text; **не** в OpenAPI schema

---

## 7. Auth — `/api/v1/auth`

### `POST /api/v1/auth/login`

- Auth: нет
- Body: `application/x-www-form-urlencoded` (`OAuth2PasswordRequestForm`): `username` (email), `password`
- Успех **200** `TokenResponse`:

| Поле | Тип | Описание |
|------|-----|----------|
| `access_token` | string | JWT |
| `refresh_token` | string | opaque |
| `token_type` | string | всегда `"bearer"` |
| `expires_in` | int | секунды жизни access |

- Ошибки: 401 `invalid_credentials`, 403 `user_inactive` / `email_not_verified`, 429 + `Retry-After`

### `POST /api/v1/auth/refresh`

- Auth: нет
- Body JSON:

| Поле | Ограничения |
|------|-------------|
| `refresh_token` | string, min_length=1, обязателен |

- Успех **200** `TokenResponse`
- Ошибки: 401 `invalid_refresh_token`

### `POST /api/v1/auth/logout`

- Auth: Bearer опционален
- Body: `refresh_token` (min_length=1)
- Успех **204** (без тела)

### `POST /api/v1/auth/verify-email`

- Auth: нет
- Body: `token` (min_length=1)
- Успех **204**
- Ошибки: 400 `invalid_email_verification_token`

### `POST /api/v1/auth/verify-email/resend`

- Auth: нет
- Body: `email` (3–320)
- Всегда **202** (не раскрывает существование пользователя; при лимите — тихий no-op)

---

## 8. Users — `/api/v1/users`

### `POST /api/v1/users`

- Auth: нет
- Body:

| Поле | Ограничения |
|------|-------------|
| `email` | 3–320, обязателен |
| `full_name` | 1–255, обязателен |
| `password` | 8–128, обязателен |
| `invitation_token` | optional, min_length=1 |

- Успех **201**: `{ "id": "<uuid>" }`
- Ошибки: 409 `email_already_registered`; при невалидном invitation — 400/403/409 по кодам приглашений

### `GET /api/v1/users/me`

- Auth: Bearer
- Успех **200** `UserResponse`: `id`, `email`, `full_name`, `is_active`, `email_verified`

### `GET /api/v1/users/{user_id}`

- Auth: **нет** (публичное чтение)
- Path: `user_id` UUID
- Успех **200** `UserResponse`
- Ошибки: 404 `user_not_found`

---

## 9. Workspaces — `/api/v1/workspaces`

### `POST /api/v1/workspaces`

- Auth: Bearer
- Body: `name` (1–255)
- Успех **201**: `{ "id": "<uuid>" }` (создатель — OWNER)

### `GET /api/v1/workspaces`

- Auth: Bearer
- Успех **200**: список `WorkspaceSummaryResponse` — `id`, `name`, `role`

### `GET /api/v1/workspaces/{workspace_id}`

- Auth: Bearer + участник
- Успех **200** `WorkspaceResponse`: `id`, `name`, `owner_id`, `members: [{user_id, role}]`
- Ошибки: 403 `permission_denied`, 404 `workspace_not_found`

### `POST /api/v1/workspaces/{workspace_id}/invitations`

- Auth: Bearer + OWNER \| ADMIN
- Body:

| Поле | Ограничения |
|------|-------------|
| `email` | 3–320, обязателен |
| `role` | `MemberRole`, по умолчанию `MEMBER`; `OWNER` запрещён доменом |

- Успех **201**: `{ "id": "<uuid>" }`

### `GET /api/v1/workspaces/{workspace_id}/invitations`

- Auth: Bearer + OWNER \| ADMIN
- Успех **200**: список `InvitationResponse` — `id`, `email`, `role`, `invited_by`, `created_at`, `expires_at`, `is_expired`

### `DELETE /api/v1/workspaces/{workspace_id}/invitations/{invitation_id}`

- Auth: Bearer + OWNER \| ADMIN
- Успех **204**

### `PATCH /api/v1/workspaces/{workspace_id}/members/{user_id}`

- Auth: Bearer + **только OWNER**
- Body: `role` (`MemberRole`, обязателен; нельзя `OWNER` / менять роль OWNER)
- Успех **204**

### `DELETE /api/v1/workspaces/{workspace_id}/members/{user_id}`

- Auth: Bearer + OWNER \| ADMIN (OWNER удалить нельзя)
- Успех **204**

---

## 10. Invitations — `/api/v1/invitations`

### `POST /api/v1/invitations/accept`

- Auth: Bearer
- Body: `token` (min_length=1)
- Успех **200**: `{ "workspace_id": "<uuid>" }`
- Ошибки: 400 `invalid_invitation_token`, 403 `invitation_email_mismatch`, 404 `invitation_not_found`, 409 `member_already_exists` / `invitation_not_pending` / `invitation_expired`

---

## 11. Clients — `/api/v1/workspaces/{workspace_id}/clients`

Общие поля create/update (`CreateClientRequest` / `UpdateClientRequest`).  
Update — **полная замена**: незаданные optional-поля очищаются.  
Формат ИНН/КПП/ОГРН проверяет домен (не regex в Pydantic).

| Поле | Ограничения | Обязательность |
|------|-------------|----------------|
| `client_type` | `company` \| `ip`, default `company` | да (есть default) |
| `name` | 1–500 | да |
| `short_name` | max 255 | нет |
| `inn` | max 12 | нет |
| `kpp` | max 9 | нет |
| `ogrn` | max 15 | нет |
| `email` | max 320 | нет |
| `phone` | max 64 | нет |
| `address` | max 1000 | нет |
| `notes` | max 5000 | нет |

Эндпоинтов **GET list / GET by id** нет.

| Метод | Путь | Роль | Успех |
|-------|------|------|-------|
| `POST` | `.../clients` | member | **201** `{id}` |
| `PUT` | `.../clients/{client_id}` | member | **204** |
| `DELETE` | `.../clients/{client_id}` | OWNER \| ADMIN | **204**; 409 `client_in_use` |
| `POST` | `.../clients/{client_id}/archive` | OWNER \| ADMIN | **204** |
| `POST` | `.../clients/{client_id}/restore` | OWNER \| ADMIN | **204** |

Архивного клиента нельзя выбрать для новой закупки/заявки → 409 `client_archived`.

---

## 12. Banks — `/api/v1/workspaces/{workspace_id}/banks`

Имя: `name` 1–255. Уникальность и нормализация — в домене.

### `GET .../banks`

- Auth: Bearer + member
- Query: `include_inactive` (bool, default `false`)
- Успех **200**: список `BankResponse` — `id`, `name`, `is_global`, `is_active`, `created_at`, `updated_at`

| Метод | Путь | Роль | Успех |
|-------|------|------|-------|
| `POST` | `.../banks` | member | **201** `{id}`; 409 `bank_already_exists` |
| `PATCH` | `.../banks/{bank_id}` | member | **204** (переименование) |
| `POST` | `.../banks/{bank_id}/deactivate` | OWNER \| ADMIN | **204** |
| `POST` | `.../banks/{bank_id}/activate` | OWNER \| ADMIN | **204** |

Неактивный банк нельзя использовать в заявке → 409 `bank_inactive`.

---

## 13. Procurements — `/api/v1/workspaces/{workspace_id}/procurements`

Общие поля (`CreateProcurementRequest` добавляет `client_id`; update — без `client_id`, полная замена).

| Поле | Ограничения | Обязательность |
|------|-------------|----------------|
| `client_id` | UUID | только create |
| `law_type` | `ProcurementLawType` | да |
| `name` | 1–1000 | да |
| `registry_number` | max 100 | нет |
| `placement_url` | max 2000 | нет |
| `customer_name` | max 500 | нет |
| `customer_inn` | max 12 | нет |
| `nmc` | Decimal \| null | нет |
| `contract_price` | Decimal \| null | нет |
| `contract_number` | max 100 | нет |
| `contract_date` | date \| null | нет |
| `platform` | max 255 | нет |
| `application_deadline` | datetime \| null | нет |
| `contract_deadline` | datetime \| null | нет |

Правила полей по ФЗ / коммерции проверяет домен → 422 `invalid_procurement`.

### `GET .../procurements`

- Auth: Bearer + member
- Query: `client_id`, `client_inn`, `registry_number`, `include_archived` (default `false`)
- Успех **200**: список `ProcurementResponse`

### `GET .../procurements/{procurement_id}`

- Auth: Bearer + member
- Успех **200** `ProcurementResponse`: поля запроса + `id`, `workspace_id`, `client_id`, `created_at`, `updated_at`, `archived_at`

| Метод | Путь | Роль | Успех |
|-------|------|------|-------|
| `POST` | `.../procurements` | member | **201** `{id}` |
| `PUT` | `.../procurements/{procurement_id}` | member | **204** |
| `DELETE` | `.../procurements/{procurement_id}` | OWNER \| ADMIN | **204**; 409 `procurement_in_use` |
| `POST` | `.../procurements/{procurement_id}/archive` | OWNER \| ADMIN | **204** |
| `POST` | `.../procurements/{procurement_id}/restore` | OWNER \| ADMIN | **204** |

Архивная закупка → 409 `procurement_archived`.

---

## 14. Applications — `/api/v1/workspaces/{workspace_id}/applications`

### Поля заявки

| Поле | Ограничения | Обязательность |
|------|-------------|----------------|
| `client_id` | UUID | только create |
| `guarantee_type` | `GuaranteeType` | да |
| `procurement_id` | UUID \| null | нет; для VAT должен быть пуст |
| `number` | max 100 | нет |
| `requested_amount` | Decimal \| null | нет |
| `requested_valid_from` / `requested_valid_to` | date \| null | нет |
| `description` | string \| null (без max в Field) | нет |
| `responsible_user_id` | UUID \| null | нет |
| `beneficiary_name` | max 500 | для VAT обязателен (домен) |
| `beneficiary_inn` | max 12 | нет |

Для БГ по НДС (`vat`): без `procurement_id`, нужен бенефициар.  
Для остальных видов — наоборот. Нарушение → 422 `invalid_application`.

Update — полная замена; `client_id` не меняется.

### `GET .../applications`

- Auth: Bearer + member
- Query: `status` (`ApplicationStatus`), `client_id`, `client_inn`, `registry_number`
- Успех **200**: список `ApplicationSummaryResponse` (без bank_requests / guarantees / history)

### `GET .../applications/{application_id}`

- Auth: Bearer + member
- Успех **200** `ApplicationResponse` = summary + `description`, `created_by_user_id`, `archive_reason`, `client_obtained_independently`, `bank_requests[]`, `guarantees[]`, `status_history[]`

| Метод | Путь | Роль | Body / примечание | Успех |
|-------|------|------|-------------------|-------|
| `POST` | `.../applications` | member | create | **201** `{id}` |
| `PUT` | `.../applications/{application_id}` | member | update | **204** |
| `POST` | `.../applications/{application_id}/archive` | member | `reason?`, `client_obtained_independently?` | **204** |
| `POST` | `.../applications/{application_id}/reopen` | member | `comment?` | **204** |

Архивная заявка не редактируется → 409 `application_archived`.  
Недопустимый переход статуса → 409 `invalid_status_transition`.

### Bank requests — `.../applications/{application_id}/bank-requests`

| Поле | Ограничения |
|------|-------------|
| `bank_id` | UUID, только add |
| `status_text` | string \| null |
| `external_number` | max 255 |
| `requested_amount` | Decimal \| null |
| `sent_at` / `decision_at` | datetime \| null |
| `rejection_reason` / `notes` | string \| null |
| `offer_received` | bool \| null |

| Метод | Путь | Роль | Успех |
|-------|------|------|-------|
| `POST` | `.../bank-requests` | member | **201** `{id}` |
| `PUT` | `.../bank-requests/{bank_request_id}` | member | **204** (банк не меняется) |
| `DELETE` | `.../bank-requests/{bank_request_id}` | OWNER \| ADMIN | **204**; 409 `bank_request_has_guarantee` |

### Guarantees — `.../applications/{application_id}/guarantees`

| Поле | Ограничения |
|------|-------------|
| `bank_request_id` | UUID, только issue |
| `amount` | Decimal, обязателен |
| `issued_at` | date, обязателен |
| `guarantee_number` | max 255 |
| `valid_from` / `valid_to` | date \| null |
| `bank_commission_amount` | Decimal \| null |
| `agent_commission_rate` | Decimal \| null |
| `agent_commission_amount` | Decimal \| null |
| `notes` | string \| null |
| `agent_commission_is_manual` | bool; на issue default `false`; на update **обязателен** |

КВ агента:

- `agent_commission_is_manual=false` — сумма считается как `комиссия банку × ставка / 100`; `agent_commission_amount` должен быть пуст.
- `agent_commission_is_manual=true` — `agent_commission_amount` обязателен.

| Метод | Путь | Роль | Успех |
|-------|------|------|-------|
| `POST` | `.../guarantees` | member | **201** `{id}` |
| `PUT` | `.../guarantees/{guarantee_id}` | member | **204** |
| `DELETE` | `.../guarantees/{guarantee_id}` | OWNER \| ADMIN | **204** |

### Лимит гарантий на заявку

- Обычно **не больше одной** выданной БГ на заявку.
- Несколько БГ допускаются только для **аванса** (`advance`) по **коммерческой** закупке.
- Иначе → 409 `guarantee_limit_exceeded`.
- Другие конфликты: `guarantee_already_issued`, `guarantee_bank_already_used`.

После выдачи статус заявки переходит в `issued`.

---

## 15. Справочник кодов ошибок

| HTTP | `code` | Когда |
|------|--------|--------|
| 401 | `invalid_credentials` | Неверный логин/пароль (+ `WWW-Authenticate`) |
| 401 | `invalid_refresh_token` | Невалидный/просроченный refresh или неактивный user при refresh |
| 429 | `too_many_login_attempts` | Rate limit логина (+ `Retry-After`) |
| 403 | `user_inactive` | Пользователь деактивирован |
| 403 | `email_not_verified` | Email не подтверждён |
| 403 | `invitation_email_mismatch` | Токен приглашения на другой email |
| 403 | `permission_denied` | Нет роли / не участник |
| 400 | `invalid_email_verification_token` | | 
| 400 | `invalid_invitation_token` | |
| 404 | `user_not_found` | |
| 404 | `workspace_not_found` | |
| 404 | `member_not_found` | |
| 404 | `client_not_found` | |
| 404 | `bank_not_found` | |
| 404 | `procurement_not_found` | |
| 404 | `application_not_found` | |
| 404 | `bank_request_not_found` | |
| 404 | `guarantee_not_found` | |
| 404 | `invitation_not_found` | |
| 409 | `email_already_registered` | |
| 409 | `member_already_exists` | |
| 409 | `bank_already_exists` | |
| 409 | `bank_inactive` | |
| 409 | `invalid_status_transition` | |
| 409 | `application_archived` | |
| 409 | `bank_request_has_guarantee` | |
| 409 | `guarantee_limit_exceeded` | |
| 409 | `guarantee_already_issued` | |
| 409 | `guarantee_bank_already_used` | |
| 409 | `client_in_use` | |
| 409 | `client_archived` | |
| 409 | `procurement_in_use` | |
| 409 | `procurement_archived` | |
| 409 | `invitation_not_pending` | |
| 409 | `invitation_expired` | |
| 409 | `data_conflict` | Гонка FK/unique в БД; клиенту без имени constraint |
| 422 | `invalid_procurement` | |
| 422 | `invalid_money_amount` | |
| 422 | `invalid_application` | |
| 422 | `domain_error` | Прочие `DomainError` (в т.ч. инварианты OWNER, невалидный email) |
| 500 | `internal_error` | Необработанное исключение |

---

## 16. Краткая карта auth

| Категория | Эндпоинты |
|-----------|-----------|
| Public | `/health`, `/metrics`, login, refresh, verify-email, resend, register, `GET /users/{user_id}` |
| Optional Bearer | logout |
| Bearer | `/users/me`, workspaces, invitations/accept, все workspace-scoped ресурсы |
| + member | почти все операции внутри workspace |
| + OWNER \| ADMIN | invitations manage, remove member, delete/archive/restore clients & procurements, activate/deactivate banks, delete bank-request & guarantee |
| + OWNER only | change member role |
