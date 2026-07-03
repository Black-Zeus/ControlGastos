const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// El access token vive solo en memoria (lo fija AdminAuthContext tras login/refresh),
// nunca en localStorage — así una regresión XSS no puede robarlo del storage.
let _authToken = ''

export function setAuthToken(t: string) {
  _authToken = t
}

function token() {
  return _authToken
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Error ${res.status}`)
  }
  return res.json()
}

export const adminApi = {
  settings: {
    general: {
      get:    ()                             => request<GeneralSettings>('/v1/admin/settings/general'),
      update: (body: GeneralSettingsPayload) => request<GeneralSettings>('/v1/admin/settings/general', { method: 'PUT', body: JSON.stringify(body) }),
    },
    smtp: {
      get:    ()                          => request<SmtpSettings>('/v1/admin/settings/smtp'),
      update: (body: SmtpSettingsPayload) => request<SmtpSettings>('/v1/admin/settings/smtp', { method: 'PUT', body: JSON.stringify(body) }),
      test:   (to_email: string)          => request<{ detail: string }>('/v1/admin/settings/smtp/test', { method: 'POST', body: JSON.stringify({ to_email }) }),
    },
    reminder: {
      get:    ()                              => request<ReminderSettings>('/v1/admin/settings/reminder'),
      update: (body: ReminderSettingsPayload) => request<ReminderSettings>('/v1/admin/settings/reminder', { method: 'PUT', body: JSON.stringify(body) }),
      test:   ()                              => request<{ detail: string }>('/v1/admin/settings/reminder/test', { method: 'POST' }),
    },
  },
  emailLogs: {
    list: (params?: { date_from?: string; date_to?: string; recipient?: string }) => {
      const qs = new URLSearchParams()
      if (params?.date_from) qs.set('date_from', params.date_from)
      if (params?.date_to)   qs.set('date_to',   params.date_to)
      if (params?.recipient) qs.set('recipient',  params.recipient)
      const query = qs.toString() ? `?${qs}` : ''
      return request<EmailLog[]>(`/v1/admin/email-logs${query}`)
    },
  },
  users: {
    list:   ()                                    => request<User[]>('/v1/admin/users'),
    create: (body: UserCreatePayload)             => request<User>('/v1/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: UserUpdatePayload) => request<User>(`/v1/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string)                          => request<void>(`/v1/admin/users/${id}`, { method: 'DELETE' }),
  },
  categories: {
    list:   ()                                            => request<Category[]>('/v1/admin/system-categories'),
    create: (body: CategoryPayload)                       => request<Category>('/v1/admin/system-categories', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<CategoryPayload>)  => request<Category>(`/v1/admin/system-categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  incomeTypes: {
    list:   ()                                               => request<IncomeType[]>('/v1/admin/system-income-types'),
    create: (body: IncomeTypePayload)                        => request<IncomeType>('/v1/admin/system-income-types', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<IncomeTypePayload>)   => request<IncomeType>(`/v1/admin/system-income-types/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  },
  tokens: {
    list:   ()                                      => request<IngestionToken[]>('/v1/admin/ingestion-tokens'),
    create: (body: TokenCreatePayload)              => request<IngestionTokenCreated>('/v1/admin/ingestion-tokens', { method: 'POST', body: JSON.stringify(body) }),
    toggle: (id: string)                            => request<IngestionToken>(`/v1/admin/ingestion-tokens/${id}`, { method: 'PATCH' }),
  },
}

export interface GeneralSettings {
  site_url: string
}

export interface GeneralSettingsPayload {
  site_url: string
}

export interface SmtpSettings {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_password: string
  smtp_from: string
  smtp_use_tls: boolean
}

export interface SmtpSettingsPayload {
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_password?: string
  smtp_from?: string
  smtp_use_tls?: boolean
}

export interface ReminderSettings {
  enabled: boolean
}

export interface ReminderSettingsPayload {
  enabled: boolean
}

export interface EmailLog {
  id: string
  sent_at: string
  to_email: string
  subject: string
  status: 'ok' | 'error'
  error_msg: string | null
}

export interface User {
  id: string
  email: string
  name: string
  is_admin: boolean
  is_active: boolean
  created_at: string
  last_login_at: string | null
  periods_open: number
  periods_closed: number
}

export interface Category {
  id: string
  name: string
  type: 'recurrente' | 'puntual'
  default_obviable: boolean
  description: string | null
  default_active: boolean
}

export interface CategoryPayload {
  name: string
  type: 'recurrente' | 'puntual'
  default_obviable: boolean
  description?: string | null
  default_active: boolean
}

export interface IncomeType {
  id: string
  name: string
  default_active: boolean
}

export interface IncomeTypePayload {
  name: string
  default_active: boolean
}

export interface UserCreatePayload {
  email: string
  password: string
  name: string
  is_admin: boolean
}

export interface UserUpdatePayload {
  name?: string
  is_admin?: boolean
  is_active?: boolean
  password?: string
}

export interface IngestionToken {
  id: string
  label: string
  active: boolean
  created_at: string
  last_used_at: string | null
  user_id: string
  user_name: string
  user_email: string
}

export interface TokenCreatePayload {
  user_id: string
  label: string
}

export interface IngestionTokenCreated extends IngestionToken {
  token: string
}
