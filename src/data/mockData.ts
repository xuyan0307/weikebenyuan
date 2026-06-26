// Mock data shared across modules

export type Role = 'superadmin' | 'admin' | 'service' | 'therapist' | 'finance';

export interface UserInfo {
  id: string;
  name: string;
  role: Role;
  avatar: string;
}

export const USERS: UserInfo[] = [
  { id: '1', name: '超级管理员', role: 'superadmin', avatar: 'S' },
  { id: '2', name: '张管理员', role: 'admin', avatar: '张' },
  { id: '3', name: '李客服', role: 'service', avatar: '李' },
  { id: '4', name: '王产康师', role: 'therapist', avatar: '王' },
  { id: '5', name: '赵财务', role: 'finance', avatar: '赵' },
];

// 标签体系：V=VIP客户，A=已升套餐，B=已体验未升单，C=已购体验卡，D=种子客户，T=退款客户，S=流失客户
export type CustomerTag =
  | 'V1' | 'V2'
  | 'A1' | 'A2'
  | 'B1' | 'B2'
  | 'C1' | 'C2'
  | 'D1' | 'D2' | 'D3'
  | 'T1' | 'T2'
  | 'S1' | 'S2';

export type FollowStatus = '待跟进' | '跟进中' | '已预约' | '已成交' | '已流失';

// 产后信息画像
export interface CustomerProfile {
  age: number;           // 年龄
  deliveryDate: string;  // 生产时间 YYYY-MM
  deliveryType: '顺产' | '剖腹产';
  babyCount: number;     // 第几胎
  feedingType: '母乳' | '奶粉' | '混合喂养';
}

export interface Customer {
  id: string;             // 6位数ID
  name: string;
  wechat: string;         // 微信号
  phone: string;
  area: string;
  source: string;
  acquiredAt: string;
  tag: CustomerTag;
  followStatus: FollowStatus;
  followDate: string;     // 下次跟进时间
  advisor: string;        // 归属客服
  totalOrders: number;
  lastFollow: string;
  profile: CustomerProfile;  // 客户画像
  situation: string;         // 客户情况（需求及问题）
  intendedProduct: string;   // 意向产品
  remark: string;            // 备注
}

export const CUSTOMERS: Customer[] = [
  {
    id: '100001', name: '刘晓燕', wechat: 'lxy_8866', phone: '138****5678',
    area: '浦东新区', source: '老客转介绍', acquiredAt: '2025-01-15',
    tag: 'V2', followStatus: '已成交', followDate: '2025-06-16',
    advisor: '李客服', totalOrders: 3, lastFollow: '2025-06-01',
    profile: { age: 30, deliveryDate: '2025-01', deliveryType: '顺产', babyCount: 2, feedingType: '母乳' },
    situation: '二胎妈妈，骨盆变形明显，腰部酸痛，对骨盆修复套餐有强烈意向',
    intendedProduct: '骨盆修复套餐', remark: '已成交VIP，优先安排',
  },
  {
    id: '100002', name: '陈美玲', wechat: 'chenml_2025', phone: '139****9012',
    area: '徐汇区', source: '小红书', acquiredAt: '2025-02-20',
    tag: 'B1', followStatus: '跟进中', followDate: '2025-06-18',
    advisor: '李客服', totalOrders: 1, lastFollow: '2025-06-05',
    profile: { age: 27, deliveryDate: '2025-02', deliveryType: '剖腹产', babyCount: 1, feedingType: '奶粉' },
    situation: '剖腹产切口恢复中，担心腹直肌分离，咨询过两次，意向明确',
    intendedProduct: '腹直肌修复课程', remark: '体验卡已购，待升单',
  },
  {
    id: '100003', name: '王芳', wechat: 'wangfang_ok', phone: '135****3456',
    area: '静安区', source: '抖音', acquiredAt: '2025-03-10',
    tag: 'D1', followStatus: '待跟进', followDate: '2025-06-20',
    advisor: '张管理员', totalOrders: 0, lastFollow: '2025-06-08',
    profile: { age: 29, deliveryDate: '2025-03', deliveryType: '顺产', babyCount: 1, feedingType: '混合喂养' },
    situation: '初产妈妈，关注盆底肌修复，价格敏感，需再跟进',
    intendedProduct: '盆底肌修复体验卡', remark: '发过资料，等回复',
  },
  {
    id: '100004', name: '张丽华', wechat: 'zlh_mama', phone: '136****7890',
    area: '杨浦区', source: '美团大众', acquiredAt: '2025-03-25',
    tag: 'C2', followStatus: '已预约', followDate: '2025-06-16',
    advisor: '李客服', totalOrders: 1, lastFollow: '2025-06-09',
    profile: { age: 31, deliveryDate: '2025-01', deliveryType: '剖腹产', babyCount: 2, feedingType: '母乳' },
    situation: '腹部赘肉及切口修复需求，已预约体验，态度积极',
    intendedProduct: '综合产康套餐', remark: '体验卡已使用，推进升单',
  },
  {
    id: '100005', name: '孙晴晴', wechat: 'sunqq88', phone: '137****2345',
    area: '宝山区', source: '老客转介绍', acquiredAt: '2025-04-05',
    tag: 'A1', followStatus: '已成交', followDate: '2025-07-01',
    advisor: '李客服', totalOrders: 2, lastFollow: '2025-06-10',
    profile: { age: 26, deliveryDate: '2025-04', deliveryType: '顺产', babyCount: 1, feedingType: '母乳' },
    situation: '产后身材恢复意愿强，关注腹直肌+骨盆联合方案，已成交套餐',
    intendedProduct: '腹直肌+骨盆联合套餐', remark: '转介绍新客户中',
  },
  {
    id: '100006', name: '周雨婷', wechat: 'zhouyt_ok', phone: '131****6789',
    area: '浦东新区', source: '小红书', acquiredAt: '2025-04-18',
    tag: 'D2', followStatus: '跟进中', followDate: '2025-06-15',
    advisor: '张管理员', totalOrders: 0, lastFollow: '2025-06-11',
    profile: { age: 28, deliveryDate: '2025-03', deliveryType: '顺产', babyCount: 1, feedingType: '奶粉' },
    situation: '对产康服务有了解，价格仍在考虑中，需持续跟进',
    intendedProduct: '体验卡', remark: '已加微信',
  },
  {
    id: '100007', name: '吴静', wechat: 'wj_mama007', phone: '132****0123',
    area: '闵行区', source: '视频号', acquiredAt: '2025-05-01',
    tag: 'D1', followStatus: '待跟进', followDate: '2025-06-25',
    advisor: '李客服', totalOrders: 0, lastFollow: '2025-06-12',
    profile: { age: 32, deliveryDate: '2024-12', deliveryType: '剖腹产', babyCount: 3, feedingType: '奶粉' },
    situation: '三胎宝妈，产后恢复期已较长，对服务了解较少，需科普引导',
    intendedProduct: '待确定', remark: '初步意向不明确',
  },
  {
    id: '100008', name: '郑娟', wechat: 'zhengjuan_vip', phone: '133****4567',
    area: '徐汇区', source: '老客转介绍', acquiredAt: '2025-05-15',
    tag: 'V1', followStatus: '已成交', followDate: '2025-06-30',
    advisor: '李客服', totalOrders: 4, lastFollow: '2025-06-10',
    profile: { age: 34, deliveryDate: '2024-11', deliveryType: '顺产', babyCount: 2, feedingType: '母乳' },
    situation: '长期VIP客户，满意度高，有转介绍意愿，关注全身调理项目',
    intendedProduct: '高端全身调理套餐', remark: '口碑客户，重点维护',
  },
  {
    id: '100009', name: '林小燕', wechat: 'linxiaoyan_sz', phone: '159****8801',
    area: '长宁区', source: '视频号', acquiredAt: '2025-05-20',
    tag: 'C1', followStatus: '跟进中', followDate: '2025-06-22',
    advisor: '张管理员', totalOrders: 0, lastFollow: '2025-06-13',
    profile: { age: 25, deliveryDate: '2025-04', deliveryType: '顺产', babyCount: 1, feedingType: '母乳' },
    situation: '刚出月子，对骨盆情况担忧，但预算有限，适合推体验卡切入',
    intendedProduct: '骨盆修复体验卡', remark: '',
  },
  {
    id: '100010', name: '赵梦琪', wechat: 'zhaomq_2025', phone: '176****3390',
    area: '普陀区', source: '美团大众', acquiredAt: '2025-06-01',
    tag: 'D3', followStatus: '待跟进', followDate: '2025-06-28',
    advisor: '李客服', totalOrders: 0, lastFollow: '2025-06-14',
    profile: { age: 29, deliveryDate: '2025-05', deliveryType: '剖腹产', babyCount: 1, feedingType: '混合喂养' },
    situation: '刚出院，切口仍在愈合，目前不宜服务，留资待后续跟进',
    intendedProduct: '待确定', remark: '切口未愈，约6月底再联系',
  },
  {
    id: '100011', name: '黄婷', wechat: 'huangting_m', phone: '182****6620',
    area: '嘉定区', source: '朋友推荐', acquiredAt: '2025-06-05',
    tag: 'B1', followStatus: '跟进中', followDate: '2025-06-17',
    advisor: '张管理员', totalOrders: 0, lastFollow: '2025-06-15',
    profile: { age: 30, deliveryDate: '2025-03', deliveryType: '顺产', babyCount: 2, feedingType: '母乳' },
    situation: '有明确的腰背疼痛症状，朋友已成交，本人态度正面，近期可推进',
    intendedProduct: '腰背综合调理套餐', remark: '朋友推荐，转化率较高',
  },
  {
    id: '100012', name: '苏雅', wechat: 'suyaa_life', phone: '188****4451',
    area: '浦东新区', source: '抖音', acquiredAt: '2025-06-10',
    tag: 'S1', followStatus: '已流失', followDate: '2025-07-10',
    advisor: '李客服', totalOrders: 0, lastFollow: '2025-06-12',
    profile: { age: 27, deliveryDate: '2025-02', deliveryType: '顺产', babyCount: 1, feedingType: '奶粉' },
    situation: '表示已在其他机构购买套餐，暂不考虑，可定期回访',
    intendedProduct: '无', remark: '已流失，季度回访',
  },
];

export type OrderType = '体验卡' | '套餐';
export type PayStatus = '已付款' | '待付款' | '已退款';

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  type: OrderType;
  amount: number;
  payStatus: PayStatus;
  createdAt: string;
  usedTimes: number;
  totalTimes: number;
  isUpgrade: boolean;
  contractSigned: boolean;
  hasCoupon: boolean;        // 是否有抵扣券奖励（服务完结后发放300元）
  serviceItemCount: number;  // 套餐单次服务项目数量（2项或3项，决定手工费单价）
}

export const ORDERS: Order[] = [
  { id: 'O20250601001', customerId: 'C001', customerName: '刘晓燕', type: '套餐', amount: 9800, payStatus: '已付款', createdAt: '2025-06-01', usedTimes: 10, totalTimes: 10, isUpgrade: true, contractSigned: true, hasCoupon: true, serviceItemCount: 3 },
  { id: 'O20250601002', customerId: 'C002', customerName: '陈美玲', type: '体验卡', amount: 299, payStatus: '已付款', createdAt: '2025-06-02', usedTimes: 0, totalTimes: 1, isUpgrade: false, contractSigned: false, hasCoupon: false, serviceItemCount: 1 },
  { id: 'O20250603003', customerId: 'C004', customerName: '张丽华', type: '体验卡', amount: 299, payStatus: '已付款', createdAt: '2025-06-03', usedTimes: 1, totalTimes: 1, isUpgrade: false, contractSigned: true, hasCoupon: false, serviceItemCount: 1 },
  { id: 'O20250604004', customerId: 'C005', customerName: '孙晴晴', type: '套餐', amount: 6800, payStatus: '已付款', createdAt: '2025-06-04', usedTimes: 8, totalTimes: 8, isUpgrade: false, contractSigned: true, hasCoupon: true, serviceItemCount: 2 },
  { id: 'O20250605005', customerId: 'C008', customerName: '郑娟', type: '套餐', amount: 12800, payStatus: '已付款', createdAt: '2025-06-05', usedTimes: 3, totalTimes: 15, isUpgrade: true, contractSigned: true, hasCoupon: false, serviceItemCount: 3 },
  { id: 'O20250606006', customerId: 'C003', customerName: '王芳', type: '体验卡', amount: 299, payStatus: '待付款', createdAt: '2025-06-06', usedTimes: 0, totalTimes: 1, isUpgrade: false, contractSigned: false, hasCoupon: false, serviceItemCount: 1 },
  { id: 'O20250607007', customerId: 'C001', customerName: '刘晓燕', type: '套餐', amount: 15800, payStatus: '已付款', createdAt: '2025-06-07', usedTimes: 1, totalTimes: 20, isUpgrade: true, contractSigned: false, hasCoupon: true, serviceItemCount: 2 },
];

export type ApptStatus = '已确认' | '待确认' | '已取消' | '已完成';

export interface Appointment {
  id: string;
  customerId: string;
  customerName: string;
  therapistId: string;
  therapistName: string;
  date: string;
  timeSlot: string;
  service: string;
  status: ApptStatus;
  area: string;
  remark: string;
}

export const APPOINTMENTS: Appointment[] = [
  { id: 'A001', customerId: 'C001', customerName: '刘晓燕', therapistId: 'T001', therapistName: '王美华', date: '2025-06-16', timeSlot: '09:00-11:00', service: '骨盆修复', status: '已完成', area: '浦东新区', remark: '' },
  { id: 'A002', customerId: 'C004', customerName: '张丽华', therapistId: 'T002', therapistName: '林晓燕', date: '2025-06-16', timeSlot: '14:00-16:00', service: '腹直肌修复,综合调理', status: '已完成', area: '杨浦区', remark: '产后6周' },
  { id: 'A003', customerId: 'C005', customerName: '孙晴晴', therapistId: 'T001', therapistName: '王美华', date: '2025-06-17', timeSlot: '10:00-12:00', service: '盆底肌修复,骨盆修复', status: '已完成', area: '宝山区', remark: '' },
  { id: 'A004', customerId: 'C002', customerName: '陈美玲', therapistId: 'T003', therapistName: '陈秀芳', date: '2025-06-17', timeSlot: '15:00-17:00', service: '骨盆修复', status: '已取消', area: '徐汇区', remark: '来姨妈' },
  { id: 'A005', customerId: 'C008', customerName: '郑娟', therapistId: 'T002', therapistName: '林晓燕', date: '2025-06-18', timeSlot: '09:00-11:00', service: '综合调理', status: '已完成', area: '徐汇区', remark: '' },
  { id: 'A006', customerId: 'C001', customerName: '刘晓燕', therapistId: 'T001', therapistName: '王美华', date: '2025-06-18', timeSlot: '14:00-16:00', service: '骨盆修复,盆底肌修复,腹直肌修复', status: '已完成', area: '浦东新区', remark: '' },
  { id: 'A007', customerId: 'C009', customerName: '林小燕', therapistId: 'T001', therapistName: '王美华', date: '2025-06-19', timeSlot: '09:30-11:30', service: '体验卡-骨盆修复', status: '已完成', area: '长宁区', remark: '体验卡初次' },
  { id: 'A008', customerId: 'C003', customerName: '王芳', therapistId: 'T002', therapistName: '林晓燕', date: '2025-06-19', timeSlot: '13:00-15:00', service: '体验卡-综合体验', status: '已完成', area: '闵行区', remark: '' },
  { id: 'A009', customerId: 'C006', customerName: '赵婷', therapistId: 'T003', therapistName: '陈秀芳', date: '2025-06-19', timeSlot: '10:00-12:00', service: '骨盆修复,运动康复', status: '已完成', area: '徐汇区', remark: '' },
  { id: 'A010', customerId: 'C007', customerName: '吴小丽', therapistId: 'T001', therapistName: '王美华', date: '2025-06-20', timeSlot: '10:00-12:00', service: '腹直肌修复,骨盆修复,盆底肌修复', status: '已完成', area: '浦东新区', remark: '' },
  { id: 'A011', customerId: 'C005', customerName: '孙晴晴', therapistId: 'T002', therapistName: '林晓燕', date: '2025-06-20', timeSlot: '14:00-16:00', service: '产后瑜伽,腹直肌修复', status: '已确认', area: '宝山区', remark: '' },
  { id: 'A012', customerId: 'C008', customerName: '郑娟', therapistId: 'T002', therapistName: '林晓燕', date: '2025-06-20', timeSlot: '10:00-12:00', service: '体验卡-综合调理', status: '已完成', area: '徐汇区', remark: '' },
  { id: 'A013', customerId: 'C001', customerName: '刘晓燕', therapistId: 'T001', therapistName: '王美华', date: '2025-06-21', timeSlot: '09:00-11:00', service: '骨盆修复,盆底肌修复', status: '已确认', area: '浦东新区', remark: '' },
  { id: 'A014', customerId: 'C004', customerName: '张丽华', therapistId: 'T003', therapistName: '陈秀芳', date: '2025-06-21', timeSlot: '14:00-16:00', service: '盆底肌修复', status: '待确认', area: '杨浦区', remark: '' },
  { id: 'A015', customerId: 'C009', customerName: '林小燕', therapistId: 'T001', therapistName: '王美华', date: '2025-06-22', timeSlot: '10:00-12:00', service: '骨盆修复,腹直肌修复', status: '已确认', area: '长宁区', remark: '' },
];

// 证书类型：含有效期+附件（健康证）
export interface CertWithExpiry {
  state: '有' | '无证书' | '办理中';
  expiry?: string;   // state='有' 时填写 YYYY-MM-DD
  fileUrl?: string;  // state='有' 时上传
}

// 证书类型（旧，兼容保留，已不在技师档案中使用）
export interface NamedCert {
  state: '有' | '无';
  certName?: string;
  fileUrl?: string;
}

// 多条目证书类型：急救证、人社局证书、协会证书
export interface MultiCert {
  state: '有' | '无';
  items?: { name: string; fileUrl?: string }[];
}

export interface Therapist {
  id: string;
  name: string;
  therapistType: string;       // 技师类型，如"产康师"
  birthYear?: string;          // 出生年份
  phone: string;
  area: string;                // 可接单范围（自由文本）
  city: '厦门' | '泉州' | '漳州'; // 所在城市
  detailAddress: string;       // 详细住址
  services: string[];          // 服务项目
  serviceMethod: string;       // 服务方式描述
  characteristics: string;     // 技师特点
  transport: string;
  status: '在职' | '离职' | '休假';
  orders: number;
  rating: number;              // 服务评分 1-5
  upgradeRate: number;         // 升单率 0-100（%）
  starLevel: 1 | 2 | 3 | 4 | 5; // 技师星级
  healthCert: CertWithExpiry;     // 健康证
  firstAidCert: MultiCert;        // 急救证
  laborCert: MultiCert;           // 人社局证书
  associationCert: MultiCert;     // 协会证书
  remark?: string;
}

export const THERAPISTS: Therapist[] = [
  {
    id: 'T001', name: '王美华', therapistType: '产康师', birthYear: '1990',
    phone: '138****1111', city: '厦门',
    area: '思明区、湖里区、集美区',
    detailAddress: '厦门市思明区莲前东路88号',
    services: ['腹直肌修复', '骨盆修复', '盆底肌修复'],
    serviceMethod: '腹直肌: 手法+仪器；骨盆: 手法矫正',
    characteristics: '手法细腻，擅长产后骨盆修复，客户满意度极高，复购率强',
    transport: '私家车', status: '在职', orders: 128, rating: 4.9,
    upgradeRate: 75, starLevel: 5,
    healthCert: { state: '有', expiry: '2026-08-30', fileUrl: '' },
    firstAidCert: { state: '有', items: [{ name: '初级急救证书（红十字会）', fileUrl: '' }] },
    laborCert: { state: '有', items: [{ name: '育婴师国家职业资格证书', fileUrl: '' }] },
    associationCert: { state: '有', items: [{ name: '中国产后康复协会技师证', fileUrl: '' }] },
    remark: '明星技师，优先安排',
  },
  {
    id: 'T002', name: '林晓燕', therapistType: '产康师', birthYear: '1993',
    phone: '139****2222', city: '厦门',
    area: '集美区、同安区',
    detailAddress: '厦门市集美区杏林路20号',
    services: ['腹直肌修复', '综合调理', '产后瑜伽'],
    serviceMethod: '综合调理: 手法+热敷；腹直肌: 仪器为主',
    characteristics: '沟通能力强，擅长心理疏导，客户粘性高',
    transport: '地铁+步行', status: '在职', orders: 96, rating: 4.8,
    upgradeRate: 62, starLevel: 4,
    healthCert: { state: '有', expiry: '2026-05-20', fileUrl: '' },
    firstAidCert: { state: '无' },
    laborCert: { state: '无' },
    associationCert: { state: '有', items: [{ name: '福建省产后康复协会会员证', fileUrl: '' }] },
    remark: '',
  },
  {
    id: 'T003', name: '陈秀芳', therapistType: '运动康复师', birthYear: '1988',
    phone: '135****3333', city: '泉州',
    area: '丰泽区、鲤城区、洛江区',
    detailAddress: '泉州市丰泽区东海街道滨海路66号',
    services: ['骨盆修复', '盆底肌修复', '运动康复'],
    serviceMethod: '盆底肌: 生物反馈仪；骨盆: 手法整复',
    characteristics: '专业运动康复背景，技术扎实，善于制定个性化方案',
    transport: '私家车', status: '在职', orders: 75, rating: 4.7,
    upgradeRate: 55, starLevel: 3,
    healthCert: { state: '有', expiry: '2025-12-31', fileUrl: '' },
    firstAidCert: { state: '有', items: [{ name: '中级急救员证（人社局）', fileUrl: '' }] },
    laborCert: { state: '有', items: [{ name: '康复治疗师资格证书', fileUrl: '' }, { name: '社区康复专项证书', fileUrl: '' }] },
    associationCert: { state: '无' },
    remark: '泉州区域负责人',
  },
  {
    id: 'T004', name: '赵丽丽', therapistType: '调理师', birthYear: '1995',
    phone: '136****4444', city: '漳州',
    area: '芗城区、龙文区',
    detailAddress: '漳州市芗城区胜利路123号',
    services: ['腹直肌修复', '产后调理', '中医推拿'],
    serviceMethod: '产后调理: 中医手法+热敷；腹直肌: 手法',
    characteristics: '中医推拿基础扎实，擅长产后寒湿调理',
    transport: '电动车', status: '休假', orders: 52, rating: 4.5,
    upgradeRate: 38, starLevel: 2,
    healthCert: { state: '办理中' },
    firstAidCert: { state: '无' },
    laborCert: { state: '无' },
    associationCert: { state: '无' },
    remark: '休假中，预计7月返岗',
  },
  {
    id: 'T005', name: '吴雅琴', therapistType: '产康师', birthYear: '1991',
    phone: '137****5555', city: '厦门',
    area: '海沧区、翔安区',
    detailAddress: '厦门市海沧区海沧大道500号',
    services: ['骨盆修复', '盆底肌修复', '母乳喂养指导'],
    serviceMethod: '骨盆: 手法+仪器双结合；盆底: 电刺激治疗',
    characteristics: '母乳喂养指导专业认证，产后早期干预经验丰富',
    transport: '私家车', status: '在职', orders: 84, rating: 4.6,
    upgradeRate: 48, starLevel: 3,
    healthCert: { state: '有', expiry: '2026-11-15', fileUrl: '' },
    firstAidCert: { state: '有', items: [{ name: '基础生命支持证书（BLS）', fileUrl: '' }] },
    laborCert: { state: '有', items: [{ name: '母婴护理员职业资格证书', fileUrl: '' }] },
    associationCert: { state: '无' },
    remark: '',
  },
  {
    id: 'T006', name: '黄淑珍', therapistType: '产康师', birthYear: '1987',
    phone: '155****6666', city: '泉州',
    area: '晋江市、石狮市',
    detailAddress: '泉州市晋江市青阳街道',
    services: ['腹直肌修复', '骨盆修复', '综合调理'],
    serviceMethod: '全套手法，腹直肌+骨盆联合方案',
    characteristics: '资深技师，从业8年，擅长复杂案例，升单率领先',
    transport: '私家车', status: '在职', orders: 210, rating: 4.9,
    upgradeRate: 82, starLevel: 5,
    healthCert: { state: '有', expiry: '2027-01-20', fileUrl: '' },
    firstAidCert: { state: '有', items: [{ name: '高级急救员证（红十字会）', fileUrl: '' }, { name: '院前急救培训证书', fileUrl: '' }] },
    laborCert: { state: '有', items: [{ name: '高级育婴师国家职业资格证书', fileUrl: '' }] },
    associationCert: { state: '有', items: [{ name: '中国产后康复协会高级技师证', fileUrl: '' }, { name: '福建省妇幼健康促进协会认证', fileUrl: '' }] },
    remark: '晋江区域核心技师',
  },
];

export interface SalaryRecord {
  id: string;
  therapistId: string;
  therapistName: string;
  month: string;
  serviceCount: number;
  laborFee: number;
  commission: number;
  total: number;
  status: '已结算' | '待结算' | '审核中';
}

export const SALARY_RECORDS: SalaryRecord[] = [
  { id: 'S001', therapistId: 'T001', therapistName: '王产康师', month: '2025-05', serviceCount: 24, laborFee: 2400, commission: 480, total: 2880, status: '已结算' },
  { id: 'S002', therapistId: 'T002', therapistName: '林技师', month: '2025-05', serviceCount: 18, laborFee: 1800, commission: 360, total: 2160, status: '已结算' },
  { id: 'S003', therapistId: 'T003', therapistName: '陈技师', month: '2025-05', serviceCount: 15, laborFee: 1500, commission: 300, total: 1800, status: '审核中' },
  { id: 'S004', therapistId: 'T001', therapistName: '王产康师', month: '2025-06', serviceCount: 12, laborFee: 1200, commission: 240, total: 1440, status: '待结算' },
  { id: 'S005', therapistId: 'T002', therapistName: '林技师', month: '2025-06', serviceCount: 9, laborFee: 900, commission: 180, total: 1080, status: '待结算' },
];

export const CHART_DATA = [
  { month: '1月', revenue: 28000, newCustomers: 12, experienceCards: 8, upgrades: 4 },
  { month: '2月', revenue: 32000, newCustomers: 15, experienceCards: 11, upgrades: 6 },
  { month: '3月', revenue: 45000, newCustomers: 20, experienceCards: 14, upgrades: 9 },
  { month: '4月', revenue: 38000, newCustomers: 16, experienceCards: 10, upgrades: 7 },
  { month: '5月', revenue: 52000, newCustomers: 25, experienceCards: 18, upgrades: 12 },
  { month: '6月', revenue: 48000, newCustomers: 22, experienceCards: 15, upgrades: 10 },
];

export const TODO_ITEMS = [
  { id: 1, type: 'contract', label: '合同未回签', count: 3, color: '#F44336', urgency: 'high' },
  { id: 2, type: 'appointment', label: '待预约客户', count: 7, color: '#FFC107', urgency: 'medium' },
  { id: 3, type: 'service', label: '待服务订单', count: 5, color: '#1E88E5', urgency: 'medium' },
  { id: 4, type: 'cancel', label: '待确认取消', count: 2, color: '#FF7043', urgency: 'high' },
];
