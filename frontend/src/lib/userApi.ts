const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

// El access token vive solo en memoria (lo fija AuthContext tras login/refresh),
// nunca en localStorage — así una regresión XSS no puede robarlo del storage.
let _authToken = ''

export function setAuthToken(t: string) {
  _authToken = t
}

export function authToken() {
  return _authToken
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken()}`,
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail ?? `Error ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface UserCategory {
  id: string
  is_system: boolean
  name: string
  type: 'recurrente' | 'puntual'
  default_obviable: boolean
  description: string | null
  active: boolean
}

export interface CategoryCreatePayload {
  name: string
  type: 'recurrente' | 'puntual'
  default_obviable?: boolean
  description?: string | null
}

export interface CategoryUpdatePayload {
  name?: string
  type?: 'recurrente' | 'puntual'
  default_obviable?: boolean
  description?: string | null
}

export interface UserIncomeType {
  id: string
  is_system: boolean
  name: string
  active: boolean
}

export interface IncomeTypeCreatePayload {
  name: string
}

export interface Income {
  id: string
  period_id: string | null
  date: string
  label: string
  amount: string
  payment_status: 'recibido' | 'pendiente'
  income_type_id: string
  income_type_name: string
  responsible_tag: string | null
  created_at: string
}

export interface IncomeCreatePayload {
  date: string
  label: string
  income_type_id: string
  amount: string
  payment_status?: 'recibido' | 'pendiente'
  responsible_tag?: string | null
}

export interface IncomeUpdatePayload {
  date?: string
  label?: string
  income_type_id?: string
  amount?: string
  payment_status?: 'recibido' | 'pendiente'
  responsible_tag?: string | null
}

// ─── API ──────────────────────────────────────────────────────────────────────

// ─── Egresos ──────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  period_id: string | null
  date: string
  label: string
  amount: string
  category_id: string
  category_name: string
  category_type: 'recurrente' | 'puntual' | ''
  obviable: boolean
  payment_status: 'pendiente' | 'saldado'
  review_status: 'borrador' | 'confirmado'
  source: 'web' | 'ingestion'
  observation: string | null
  responsible_tag: string | null
  created_at: string
  attachment_count: number
  shopping_list_id: string | null
  items: { label: string; amount: string }[] | null
}

export interface AttachmentOut {
  id: string
  original_filename: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
}

export interface ExpenseCreatePayload {
  date: string
  label: string
  category_id: string
  amount: string
  obviable?: boolean
  payment_status?: 'pendiente' | 'saldado'
  observation?: string | null
  responsible_tag?: string | null
}

export interface OcrPreview {
  ocr_raw_text: string
  amount: string | null
  category_id: string | null
  category_name: string | null
}

export interface ExpenseUpdatePayload {
  date?: string
  label?: string
  category_id?: string
  amount?: string
  obviable?: boolean
  payment_status?: 'pendiente' | 'saldado'
  review_status?: 'borrador' | 'confirmado'
  observation?: string | null
  responsible_tag?: string | null
}

// ─── Períodos ─────────────────────────────────────────────────────────────────

export interface Period {
  id: string
  year: number
  month: number
  status: 'abierto' | 'cerrado'
  notes: string | null
  total_incomes: string | null
  total_expenses: string | null
  balance: string | null
  report_key: string | null
  opened_at: string
  closed_at: string | null
  created_at: string
}

// ─── Perfil ───────────────────────────────────────────────────────────────────

export interface MeOut {
  id: string
  email: string
  name: string
  is_admin: boolean
  currency: string
  timezone: string
  has_avatar: boolean
  receive_reminders: boolean
  reminder_hour: number
  reminders_globally_enabled: boolean
}

export interface ProfileUpdatePayload {
  name?: string
  currency?: string
  timezone?: string
  receive_reminders?: boolean
  reminder_hour?: number
}

export interface PasswordChangePayload {
  current_password: string
  new_password: string
}

// ─── Períodos ─────────────────────────────────────────────────────────────────

export interface PeriodCreatePayload {
  year: number
  month: number
}

export interface PeriodClosePayload {
  notes?: string | null
  handle_pending?: 'carry' | 'delete'
}

export interface PeriodOpenOut extends Period {
  carry_forward_count: number
}

// ─── Listas de compra ─────────────────────────────────────────────────────────

export interface ShoppingListItem {
  id: string
  label: string
  quantity: string
  purchased: boolean
  unit_price: string | null
  observation: string | null
  obviable: boolean
  sent_at: string | null
  position: number
}

export interface ShoppingList {
  id: string
  name: string
  default_category_id: string | null
  archived: boolean
  created_at: string
  updated_at: string
  last_sent_at: string | null
  items: ShoppingListItem[]
  item_count: number
  purchased_count: number
  pending_send_count: number
}

export interface ShoppingListCreatePayload {
  name: string
  default_category_id?: string | null
}

export interface ShoppingListUpdatePayload {
  name?: string
  default_category_id?: string | null
  archived?: boolean
}

export interface ShoppingListItemCreatePayload {
  label: string
  quantity?: string
  unit_price?: string | null
  observation?: string | null
  obviable?: boolean
}

export interface ShoppingListItemUpdatePayload {
  label?: string
  quantity?: string
  purchased?: boolean
  unit_price?: string | null
  observation?: string | null
  obviable?: boolean
  position?: number
}

export interface SendToExpensePayload {
  date: string
  label?: string
  category_id?: string
  observation?: string | null
  responsible_tag?: string | null
}

export const userApi = {
  categories: {
    list:   ()                                           => request<UserCategory[]>('/v1/categories'),
    create: (body: CategoryCreatePayload)                => request<UserCategory>('/v1/categories', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: CategoryUpdatePayload)    => request<UserCategory>(`/v1/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    toggle: (id: string)                                 => request<{ id: string; active: boolean }>(`/v1/categories/${id}/toggle`, { method: 'PATCH' }),
    delete: (id: string)                                 => request<void>(`/v1/categories/${id}`, { method: 'DELETE' }),
  },
  incomeTypes: {
    list:   ()                                           => request<UserIncomeType[]>('/v1/income-types'),
    create: (body: IncomeTypeCreatePayload)              => request<UserIncomeType>('/v1/income-types', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: IncomeTypeCreatePayload)  => request<UserIncomeType>(`/v1/income-types/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    toggle: (id: string)                                 => request<{ id: string; active: boolean }>(`/v1/income-types/${id}/toggle`, { method: 'PATCH' }),
    delete: (id: string)                                 => request<void>(`/v1/income-types/${id}`, { method: 'DELETE' }),
  },
  expenses: {
    list:   (year?: number, month?: number)              => {
      const params = new URLSearchParams()
      if (year)  params.set('year',  String(year))
      if (month) params.set('month', String(month))
      const qs = params.toString()
      return request<Expense[]>(`/v1/expenses${qs ? `?${qs}` : ''}`)
    },
    create: (body: ExpenseCreatePayload)                 => request<Expense>('/v1/expenses', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: ExpenseUpdatePayload)     => request<Expense>(`/v1/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string)                                 => request<void>(`/v1/expenses/${id}`, { method: 'DELETE' }),
    ocrPreview: (file: File)                             => {
      const fd = new FormData()
      fd.append('file', file)
      return fetch(`${BASE}/v1/expenses/ocr-preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken()}` },
        body: fd,
      }).then(async r => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.detail ?? `Error ${r.status}`)
        }
        return r.json() as Promise<OcrPreview>
      })
    },
  },
  incomes: {
    list:   (year?: number, month?: number)              => {
      const params = new URLSearchParams()
      if (year)  params.set('year',  String(year))
      if (month) params.set('month', String(month))
      const qs = params.toString()
      return request<Income[]>(`/v1/incomes${qs ? `?${qs}` : ''}`)
    },
    create: (body: IncomeCreatePayload)                  => request<Income>('/v1/incomes', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: IncomeUpdatePayload)      => request<Income>(`/v1/incomes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string)                                 => request<void>(`/v1/incomes/${id}`, { method: 'DELETE' }),
  },
  periods: {
    list:    ()                                          => request<Period[]>('/v1/periods'),
    current: ()                                          => request<Period>('/v1/periods/current'),
    open:    (body: PeriodCreatePayload)                 => request<PeriodOpenOut>('/v1/periods', { method: 'POST', body: JSON.stringify(body) }),
    close:   (id: string, body: PeriodClosePayload)      => request<Period>(`/v1/periods/${id}/close`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete:  (id: string)                                => request<void>(`/v1/periods/${id}`, { method: 'DELETE' }),
    get:     (id: string)                                => request<Period>(`/v1/periods/${id}`),
    reopen: (id: string) =>
      request<Period>(`/v1/periods/${id}/reopen`, { method: 'PATCH' }),
    fetchReportBlob: (id: string): Promise<Blob> =>
      fetch(`${BASE}/v1/periods/${id}/report`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      }).then(async r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        return r.blob()
      }),
    downloadReport: (id: string, filename: string) =>
      fetch(`${BASE}/v1/periods/${id}/report`, {
        headers: { Authorization: `Bearer ${authToken()}` },
      }).then(async r => {
        if (!r.ok) throw new Error(`Error ${r.status}`)
        const blob = await r.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }),
  },
  profile: {
    get:            ()                                          => request<MeOut>('/v1/me'),
    update:         (body: ProfileUpdatePayload)                => request<MeOut>('/v1/me', { method: 'PATCH', body: JSON.stringify(body) }),
    changePassword: (body: PasswordChangePayload)               => request<{ access_token: string }>('/v1/me/password', { method: 'PATCH', body: JSON.stringify(body) }),
    uploadAvatar:   (file: File)                                => {
      const fd = new FormData()
      fd.append('file', file)
      return fetch(`${BASE}/v1/me/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken()}` },
        body: fd,
      }).then(async r => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.detail ?? `Error ${r.status}`)
        }
        return r.json() as Promise<MeOut>
      })
    },
    deleteAvatar:   ()                                          => request<MeOut>('/v1/me/avatar', { method: 'DELETE' }),
    avatarContentUrl: ()                                        => `${BASE}/v1/me/avatar/content`,
    getResponsibleTags: ()                                      => request<string[]>('/v1/me/responsible-tags'),
    addResponsibleTag:  (tag: string)                           => request<string[]>('/v1/me/responsible-tags', { method: 'POST', body: JSON.stringify({ tag }) }),
  },
  attachments: {
    list:    (expenseId: string)                         => request<AttachmentOut[]>(`/v1/expenses/${expenseId}/attachments`),
    upload:  (expenseId: string, file: File)             => {
      const fd = new FormData()
      fd.append('file', file)
      return fetch(`${BASE}/v1/expenses/${expenseId}/attachments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken()}` },
        body: fd,
      }).then(async r => {
        if (!r.ok) {
          const b = await r.json().catch(() => ({}))
          throw new Error(b.detail ?? `Error ${r.status}`)
        }
        return r.json() as Promise<AttachmentOut>
      })
    },
    delete:  (expenseId: string, attId: string)          => request<void>(`/v1/expenses/${expenseId}/attachments/${attId}`, { method: 'DELETE' }),
    contentUrl: (expenseId: string, attId: string)       => `${BASE}/v1/expenses/${expenseId}/attachments/${attId}/content`,
  },
  shoppingLists: {
    list:   (archived?: boolean)                         => request<ShoppingList[]>(`/v1/shopping-lists${archived !== undefined ? `?archived=${archived}` : ''}`),
    get:    (id: string)                                 => request<ShoppingList>(`/v1/shopping-lists/${id}`),
    create: (body: ShoppingListCreatePayload)            => request<ShoppingList>('/v1/shopping-lists', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: ShoppingListUpdatePayload) => request<ShoppingList>(`/v1/shopping-lists/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    delete: (id: string)                                 => request<void>(`/v1/shopping-lists/${id}`, { method: 'DELETE' }),
    clone:  (id: string, name?: string)                  => request<ShoppingList>(`/v1/shopping-lists/${id}/clone`, { method: 'POST', body: JSON.stringify({ name }) }),
    reset:  (id: string)                                 => request<ShoppingList>(`/v1/shopping-lists/${id}/reset`, { method: 'POST' }),
    sendToExpense: (id: string, body: SendToExpensePayload) => request<Expense>(`/v1/shopping-lists/${id}/send-to-expense`, { method: 'POST', body: JSON.stringify(body) }),
    items: {
      create: (listId: string, body: ShoppingListItemCreatePayload)                => request<ShoppingListItem>(`/v1/shopping-lists/${listId}/items`, { method: 'POST', body: JSON.stringify(body) }),
      update: (listId: string, itemId: string, body: ShoppingListItemUpdatePayload) => request<ShoppingListItem>(`/v1/shopping-lists/${listId}/items/${itemId}`, { method: 'PATCH', body: JSON.stringify(body) }),
      delete: (listId: string, itemId: string)                                     => request<void>(`/v1/shopping-lists/${listId}/items/${itemId}`, { method: 'DELETE' }),
    },
  },
}
