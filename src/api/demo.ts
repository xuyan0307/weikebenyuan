import {
  APPOINTMENTS,
  CHART_DATA,
  CUSTOMERS,
  ORDERS,
  SALARY_RECORDS,
  THERAPISTS,
  USERS,
} from '../data/mockData';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const DEMO_DB_KEY = 'wkby_demo_db_v1';
const DEMO_TOKEN = 'demo-token';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function makeInitialDb() {
  return {
    customers: clone(CUSTOMERS),
    orders: clone(ORDERS),
    appointments: clone(APPOINTMENTS),
    therapists: clone(THERAPISTS),
    salaryRecords: clone(SALARY_RECORDS),
    users: USERS.map((u, index) => ({
      ...u,
      username: index === 0 ? 'admin' : u.name,
      phone: `1380000000${index + 1}`,
      email: '',
      wechat: '',
      status: 'active',
      createdAt: '2026-07-01',
    })),
    serviceRecords: APPOINTMENTS.filter(a => a.status === '已完成').map((a, index) => ({
      id: `SR${String(index + 1).padStart(3, '0')}`,
      appointmentId: a.id,
      customerId: a.customerId,
      customerName: a.customerName,
      therapistId: a.therapistId,
      therapistName: a.therapistName,
      serviceDate: `${a.date} ${a.timeSlot.split('-')[0]}`,
      serviceItems: a.service,
      duration: 120,
      feedback: index % 2 === 0 ? '客户反馈良好，服务过程顺利。' : '已完成本次服务，继续跟进后续预约。',
      photos: [],
    })),
    operationLogs: [
      {
        id: 'LOG001',
        user_id: '1',
        username: '超级管理员',
        action: 'DEMO_LOGIN',
        module: 'auth',
        description: '进入演示模式',
        ip_address: '127.0.0.1',
        created_at: new Date().toISOString(),
      },
    ],
  };
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DEMO_DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const db = makeInitialDb();
  saveDb(db);
  return db;
}

function saveDb(db: any) {
  try {
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
  } catch {}
}

function pageRows<T>(rows: T[], params?: Record<string, any>) {
  const page = Math.max(1, Number(params?.page) || 1);
  const pageSize = Math.max(1, Number(params?.pageSize) || 10);
  const start = (page - 1) * pageSize;
  return {
    total: rows.length,
    page,
    pageSize,
    data: rows.slice(start, start + pageSize),
  };
}

function nextId(prefix: string) {
  return `${prefix}${Date.now().toString().slice(-8)}`;
}

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function latestOrderFollowDate(order: any) {
  const records = Array.isArray(order?.servicePeople?.followRecords)
    ? order.servicePeople.followRecords
    : [];
  return [...records]
    .sort((left: any, right: any) =>
      String(right?.createdAt || right?.date || '').localeCompare(
        String(left?.createdAt || left?.date || '')
      )
    )[0]?.date || '';
}

function currentUser() {
  return {
    id: '1',
    username: 'admin',
    name: '超级管理员',
    role: 'superadmin',
    avatar: '管',
    phone: '13800000001',
    email: 'admin@demo.local',
  };
}

function filterCustomers(rows: any[], params?: Record<string, any>) {
  const keyword = String(params?.keyword || '').trim();
  const tag = String(params?.tag || '').trim();
  const followStatus = String(params?.followStatus || '').trim();
  const followTimes = String(params?.followTimes || '').split(',').map(value => value.trim()).filter(Boolean);
  const includeOrdered = params?.includeOrdered === 1 || params?.includeOrdered === true || params?.includeOrdered === '1' || params?.includeOrdered === 'true';
  const dueFollowUp = params?.dueFollowUp === 1 || params?.dueFollowUp === true || params?.dueFollowUp === '1' || params?.dueFollowUp === 'true';
  const today = new Date().toISOString().slice(0, 10);
  return rows.filter(row => {
    if (followTimes.includes('none')) return false;
    if (!includeOrdered && Number(row.totalOrders || 0) > 0) return false;
    if (tag && row.tag !== tag) return false;
    if (followStatus && row.followStatus !== followStatus) return false;
    if (followTimes.length > 0 && followTimes.length < 3) {
      if (!row.followDate) return false;
      const followTime = row.followDate === today
        ? 'today'
        : row.followDate < today
          ? 'overdue'
          : 'pending';
      if (!followTimes.includes(followTime)) return false;
    }
    if (dueFollowUp && (
      !row.followDate
      || row.followDate > today
      || ['已完成', '已成交', '已预约', '已流失'].includes(row.followStatus)
    )) return false;
    if (keyword) {
      const text = `${row.id} ${row.name} ${row.phone} ${row.wechat} ${row.area}`;
      if (!text.includes(keyword)) return false;
    }
    return true;
  });
}

function filterOrders(rows: any[], params?: Record<string, any>) {
  const payStatus = String(params?.payStatus || '').trim();
  const customerId = String(params?.customerId || '').trim();
  return rows.filter(row => {
    if (payStatus && row.payStatus !== payStatus) return false;
    if (customerId && row.customerId !== customerId && row.customerCode !== customerId) return false;
    return true;
  });
}

function filterAppointments(rows: any[], params?: Record<string, any>) {
  const date = String(params?.date || '').trim();
  const from = String(params?.from || '').trim();
  const to = String(params?.to || '').trim();
  const status = String(params?.status || '').trim();
  return rows.filter(row => {
    if (date && row.date !== date) return false;
    if (from && row.date < from) return false;
    if (to && row.date > to) return false;
    if (status && row.status !== status) return false;
    return true;
  });
}

function filterTherapists(rows: any[], params?: Record<string, any>) {
  const city = String(params?.city || '').trim();
  const status = String(params?.status || '').trim();
  return rows.filter(row => (!city || row.city === city) && (!status || row.status === status));
}

function makeStats(db: any) {
  const paidOrders = db.orders.filter((o: any) => o.payStatus === '已付款');
  const experienceOrders = paidOrders.filter((o: any) => o.type === '体验卡');
  const upgradeOrders = paidOrders.filter((o: any) => o.type === '套餐');
  const packagesByCustomer = new Map<string, any[]>();
  upgradeOrders.forEach((order: any) => {
    const key = String(order.customerId || order.customerName || '');
    packagesByCustomer.set(key, [...(packagesByCustomer.get(key) || []), order]);
  });
  const secondUpgrades = Array.from(packagesByCustomer.values()).flatMap(orders =>
    orders.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(1)
  );
  return {
    period: 'month',
    new_customers: db.customers.length,
    total_revenue: paidOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0),
    experience_revenue: experienceOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0),
    upgrade_revenue: upgradeOrders.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0),
    experience_cards: experienceOrders.length,
    upgrades: upgradeOrders.length,
    second_upgrade_count: secondUpgrades.length,
    second_upgrade_revenue: secondUpgrades.reduce((sum: number, o: any) => sum + Number(o.amount || 0), 0),
  };
}

function makeContracts(db: any, params?: Record<string, any>) {
  const signed = String(params?.signed ?? '').trim();
  const rows = db.orders
    .filter((o: any) => o.type === '套餐' && o.payStatus === '已付款')
    .map((o: any) => ({
    id: o.id,
    orderId: o.id,
    customerId: o.customerId,
    customerName: o.customerName,
    amount: o.amount,
    type: o.type,
    payStatus: o.payStatus,
    contractSigned: Boolean(o.contractSigned),
    createdAt: o.createdAt,
  })).filter((row: any) => {
    if (signed === 'true' || signed === '1') return row.contractSigned;
    if (signed === 'false' || signed === '0') return !row.contractSigned;
    return true;
  });
  return rows;
}

function upsertById(rows: any[], id: string, body: any) {
  const index = rows.findIndex(row => row.id === id || row._id === id);
  if (index >= 0) rows[index] = { ...rows[index], ...body, id: rows[index].id };
  return rows[index];
}

function removeById(rows: any[], id: string) {
  const index = rows.findIndex(row => row.id === id || row._id === id);
  if (index >= 0) rows.splice(index, 1);
}

function log(db: any, method: string, path: string) {
  db.operationLogs.unshift({
    id: nextId('LOG'),
    user_id: '1',
    username: '超级管理员',
    action: `${method} ${path}`,
    module: path.split('/')[1] || 'demo',
    description: `演示模式操作：${method} ${path}`,
    ip_address: '127.0.0.1',
    created_at: new Date().toISOString(),
  });
}

export async function handleDemoRequest<T>(
  method: HttpMethod,
  path: string,
  body?: any,
  params?: Record<string, any>,
): Promise<T> {
  await new Promise(resolve => setTimeout(resolve, 120));
  const db = loadDb();
  const parts = path.split('/').filter(Boolean);

  if (path === '/auth/login' && method === 'POST') {
    return { token: DEMO_TOKEN, user: currentUser() } as T;
  }
  if (path === '/auth/me' && method === 'GET') {
    return { user: currentUser() } as T;
  }
  if (path === '/auth/password' && method === 'PUT') {
    return { message: '演示模式已跳过密码修改' } as T;
  }

  if (path === '/dashboard/stats') return makeStats(db) as T;
  if (path === '/dashboard/chart') {
    return CHART_DATA.map(row => ({
      month: `2026-${String(row.month).replace('月', '').padStart(2, '0')}`,
      revenue: row.revenue,
      new_customers: row.newCustomers,
      experience_cards: row.experienceCards,
      upgrades: row.upgrades,
    })) as T;
  }
  if (path === '/dashboard/todos') {
    const today = localDateKey();
    const orderCustomerIds = new Set(
      db.orders
        .filter((item: any) => latestOrderFollowDate(item) === today)
        .map((item: any) => String(item.customerId || item.customerCode || ''))
        .filter(Boolean)
    );
    return [
      {
        id: 1,
        type: 'new-customer-followup',
        label: '新客待跟进通知',
        count: db.customers.filter((item: any) =>
          ['D1', 'D2', 'D3'].includes(item.tag)
          && Number(item.totalOrders || 0) === 0
          && item.followDate === today
        ).length,
        color: '#1E88E5',
        urgency: 'high',
      },
      {
        id: 2,
        type: 'order-customer-followup',
        label: '订单客户待跟进通知',
        count: orderCustomerIds.size,
        color: '#FF7043',
        urgency: 'high',
      },
      {
        id: 3,
        type: 'appointment-notification',
        label: '预约通知',
        count: db.appointments.filter((item: any) =>
          item.notifyStatus === '需通知'
          && !['已完成', '取消', '已取消'].includes(item.status)
        ).length,
        color: '#FFC107',
        urgency: 'high',
      },
      {
        id: 4,
        type: 'contract-pending-signature',
        label: '合同待回签',
        count: db.orders.filter((item: any) =>
          item.type === '套餐' && !item.contractSigned
        ).length,
        color: '#E53935',
        urgency: 'high',
      },
    ] as T;
  }
  if (path === '/dashboard/recent') {
    return {
      customers: db.customers.slice(0, 5),
      orders: db.orders.slice(0, 5),
      appointments: db.appointments.slice(0, 5),
    } as T;
  }

  if (parts[0] === 'customers') {
    if (method === 'GET' && parts.length === 1) return pageRows(filterCustomers(db.customers, params), params) as T;
    if (method === 'GET' && parts[1] === 'filter-options') {
      return {
        advisors: Array.from(new Set(db.customers.map((customer: any) => customer.advisor).filter(Boolean))),
      } as T;
    }
    if (method === 'GET') return db.customers.find((c: any) => c.id === parts[1] || c._id === parts[1]) as T;
    if (method === 'POST') {
      const item = { id: nextId('10'), totalOrders: 0, lastFollow: '', ...body };
      db.customers.unshift(item);
      log(db, method, path);
      saveDb(db);
      return { id: item.id, code: item.id } as T;
    }
    if (method === 'PUT') {
      upsertById(db.customers, parts[1], body);
      log(db, method, path);
      saveDb(db);
      return { message: '更新成功' } as T;
    }
    if (method === 'PATCH' && parts[2] === 'follow') {
      const item = db.customers.find((c: any) => c.id === parts[1]);
      if (item) Object.assign(item, { followStatus: body.followStatus, followDate: body.followDate, lastFollow: new Date().toISOString().slice(0, 10) });
      log(db, method, path);
      saveDb(db);
      return { message: '跟进状态已更新' } as T;
    }
    if (method === 'DELETE') {
      removeById(db.customers, parts[1]);
      log(db, method, path);
      saveDb(db);
      return { message: '已删除' } as T;
    }
  }

  if (parts[0] === 'orders') {
    if (method === 'GET' && parts.length === 1) return pageRows(filterOrders(db.orders, params), params) as T;
    if (method === 'POST') {
      const customer = db.customers.find((c: any) => c.id === body.customerId || c.name === body.customerName);
      const item = { id: nextId('O'), createdAt: new Date().toISOString().slice(0, 10), usedTimes: 0, contractSigned: false, ...body };
      if (customer) {
        item.customerId = customer.id;
        item.customerName = customer.name;
      }
      db.orders.unshift(item);
      log(db, method, path);
      saveDb(db);
      return { id: item.id, orderNo: item.id } as T;
    }
    if (method === 'PUT') {
      upsertById(db.orders, parts[1], body);
      log(db, method, path);
      saveDb(db);
      return { message: '订单已更新' } as T;
    }
    if (method === 'PATCH' && parts[2] === 'status') {
      const item = db.orders.find((o: any) => o.id === parts[1]);
      if (item) item.payStatus = body.status;
      log(db, method, path);
      saveDb(db);
      return { message: '订单状态已更新' } as T;
    }
    if (method === 'PATCH' && parts[2] === 'contract') {
      const item = db.orders.find((o: any) => o.id === parts[1]);
      if (item) item.contractSigned = Boolean(body.signed);
      log(db, method, path);
      saveDb(db);
      return { message: '合同状态已更新' } as T;
    }
    if (method === 'DELETE') {
      removeById(db.orders, parts[1]);
      log(db, method, path);
      saveDb(db);
      return { message: '已删除' } as T;
    }
  }

  if (parts[0] === 'appointments') {
    if (method === 'GET') return pageRows(filterAppointments(db.appointments, params), params) as T;
    if (method === 'POST') {
      const item = { id: nextId('A'), ...body };
      db.appointments.unshift(item);
      log(db, method, path);
      saveDb(db);
      return { id: item.id, no: item.id } as T;
    }
    if (method === 'PUT') {
      upsertById(db.appointments, parts[1], body);
      log(db, method, path);
      saveDb(db);
      return { message: '预约已更新' } as T;
    }
    if (method === 'PATCH' && parts[2] === 'notification-status') {
      const item = db.appointments.find((a: any) => a.id === parts[1] || a._id === parts[1]);
      if (item) {
        item.notifyStatus = body.status;
        item.notifyManualStatus = body.status;
      }
      log(db, method, path);
      saveDb(db);
      return { message: '通知状态已更新', status: body.status } as T;
    }
    if (method === 'PATCH') {
      const item = db.appointments.find((a: any) => a.id === parts[1]);
      if (item) item.status = body.status;
      log(db, method, path);
      saveDb(db);
      return { message: '预约状态已更新' } as T;
    }
    if (method === 'DELETE') {
      removeById(db.appointments, parts[1]);
      log(db, method, path);
      saveDb(db);
      return { message: '已删除' } as T;
    }
  }

  if (parts[0] === 'therapists') {
    if (method === 'GET' && parts.length === 1) return pageRows(filterTherapists(db.therapists, params), params) as T;
    if (method === 'GET') return db.therapists.find((t: any) => t.id === parts[1]) as T;
    if (method === 'POST') {
      const item = { id: nextId('T'), orders: 0, rating: 5, upgradeRate: 0, starLevel: 1, ...body };
      db.therapists.unshift(item);
      log(db, method, path);
      saveDb(db);
      return { id: item.id } as T;
    }
    if (method === 'PUT') {
      upsertById(db.therapists, parts[1], body);
      log(db, method, path);
      saveDb(db);
      return { message: '更新成功' } as T;
    }
    if (method === 'PATCH') {
      const item = db.therapists.find((t: any) => t.id === parts[1]);
      if (item) item.status = body.status;
      log(db, method, path);
      saveDb(db);
      return { message: '状态已更新' } as T;
    }
    if (method === 'DELETE') {
      removeById(db.therapists, parts[1]);
      log(db, method, path);
      saveDb(db);
      return { message: '已删除' } as T;
    }
  }

  if (parts[0] === 'service-records') {
    if (method === 'GET') return pageRows(db.serviceRecords, params) as T;
    if (method === 'POST') {
      const item = { id: nextId('SR'), ...body };
      db.serviceRecords.unshift(item);
      log(db, method, path);
      saveDb(db);
      return { id: item.id } as T;
    }
  }

  if (parts[0] === 'finance') {
    if (parts[1] === 'salary' && method === 'GET') {
      const month = String(params?.month || '2025-06');
      return { month, data: db.salaryRecords.filter((r: any) => r.month === month) } as T;
    }
    if (parts[1] === 'salary' && parts[3] === 'settle') {
      const item = db.salaryRecords.find((r: any) => r.id === parts[2]);
      if (item) item.status = '已结算';
      log(db, method, path);
      saveDb(db);
      return { message: '已结算' } as T;
    }
    if (parts[1] === 'income') {
      return {
        monthly: CHART_DATA.map(r => ({ month: r.month, revenue: r.revenue, expense: Math.round(r.revenue * 0.42), profit: Math.round(r.revenue * 0.58) })),
        summary: makeStats(db),
      } as T;
    }
  }

  if (parts[0] === 'contracts') {
    if (method === 'GET') return pageRows(makeContracts(db, params), params) as T;
    if (method === 'PATCH') {
      const order = db.orders.find((o: any) => o.id === parts[1]);
      if (order) order.contractSigned = Boolean(body.signed);
      log(db, method, path);
      saveDb(db);
      return { message: '合同状态已更新' } as T;
    }
  }

  if (parts[0] === 'operation-logs') return pageRows(db.operationLogs, params) as T;

  if (parts[0] === 'users') {
    if (method === 'GET') return { data: db.users } as T;
    if (method === 'POST') {
      const item = { id: nextId('U'), status: 'active', createdAt: new Date().toISOString().slice(0, 10), ...body };
      db.users.unshift(item);
      log(db, method, path);
      saveDb(db);
      return { id: item.id } as T;
    }
    if (method === 'PUT') {
      upsertById(db.users, parts[1], body);
      log(db, method, path);
      saveDb(db);
      return { message: '更新成功' } as T;
    }
    if (method === 'DELETE') {
      removeById(db.users, parts[1]);
      log(db, method, path);
      saveDb(db);
      return { message: '已删除' } as T;
    }
  }

  throw { status: 404, message: `演示接口未实现：${method} ${path}` };
}

export async function handleDemoUpload<T>(_path: string, formData: FormData): Promise<T> {
  const files = formData.getAll('files').filter(Boolean) as File[];
  return {
    data: files.map(file => ({
      id: nextId('att-'),
      name: file.name,
      type: file.type,
      size: file.size,
      objectKey: `demo/${file.name}`,
      url: URL.createObjectURL(file),
      uploadedAt: new Date().toISOString(),
    })),
  } as T;
}

export async function handleDemoDownload(): Promise<Blob> {
  return new Blob(['demo export'], { type: 'text/plain;charset=utf-8' });
}
