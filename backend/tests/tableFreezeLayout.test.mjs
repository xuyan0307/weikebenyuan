import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { orderServiceRoleDisplay } from '../../src/utils/orderServiceRoleDisplay.ts';
import { packageServiceStatusText, servicePersonStatus } from '../../src/utils/servicePersonStatus.ts';
import {
  matchesOrderServiceStatuses,
  matchesOrderTherapists,
  orderServiceFilterStatus,
  orderTherapistFilterValue,
} from '../../src/utils/orderListFilters.ts';
import { matchesAppointmentCities } from '../../src/utils/appointmentCalendarFilters.ts';
import {
  matchesOrderFollowStatuses,
  ORDER_FOLLOW_STATUS_VALUES,
} from '../../src/utils/orderFollowStatusFilter.ts';

const customersSource = readFileSync(new URL('../../src/components/CustomersListPage.tsx', import.meta.url), 'utf8');
const ordersSource = readFileSync(new URL('../../src/components/OrdersListPage.tsx', import.meta.url), 'utf8');
const compactAreaSource = readFileSync(new URL('../../src/utils/compactArea.ts', import.meta.url), 'utf8');

function assertSharedFreezeContract(source, timeLabel) {
  assert.match(source, /const COL_W = \[82, 110\]/, 'left freeze pane must contain exactly two columns');
  assert.match(source, new RegExp(`<th style=\\{STICKY_TH_STYLE\\(0\\)\\}>${timeLabel}<\\/th>[\\s\\S]*?<th style=\\{STICKY_TH_STYLE\\(1\\)\\}>客户姓名<\\/th>`));
  assert.doesNotMatch(source, /STICKY_TH_STYLE\([23]\)/, 'tag and customer id must not remain left-frozen');
  assert.match(source, /const ACTION_COL_W = 136;/, 'right-frozen action column must fit both full buttons');
  assert.match(source, /<th style=\{STICKY_RIGHT_TH_STYLE\}>操作<\/th>/, 'operation header must be right-frozen');
  assert.match(source, /<td style=\{STICKY_RIGHT_TD_STYLE\([^)]*\)\}>[\s\S]*?<RecordActionButtons/, 'operation cells must be right-frozen');
}

test('customer table freezes only acquisition time/name and places id after advisor', () => {
  assertSharedFreezeContract(customersSource, '获客时间');
  assert.match(customersSource, /<th[^>]*>归属客服<\/th>\s*<th[^>]*>客户ID<\/th>\s*<th style=\{STICKY_RIGHT_TH_STYLE\}>操作<\/th>/);
});

test('order table freezes only purchase time/name and places id after advisor', () => {
  assertSharedFreezeContract(ordersSource, '购卡时间');
  assert.match(ordersSource, /<th>归属客服<\/th>\s*<th[^>]*>客户ID<\/th>\s*<th>产康师<\/th>/);
  assert.match(ordersSource, /<th>产康师<\/th>[\s\S]*?产康服务[\s\S]*?<th>运动康复师<\/th>[\s\S]*?运动服务[\s\S]*?<th>体质调理师<\/th>[\s\S]*?调理服务/);
  assert.match(ordersSource, /zIndex: 12,[\s\S]*?function STICKY_RIGHT_TD_STYLE[\s\S]*?zIndex: 10,/,
    'right-frozen action pane must render above horizontally scrolled table content');
  assert.match(ordersSource, /STICKY_RIGHT_TD_STYLE\('var\(--card\)'\)/,
    'summary-row action cell must use an opaque background');
});

test('order service roles show each assigned specialist and independent progress', () => {
  const order = {
    type: '套餐',
    usedTimes: 7,
    totalTimes: 10,
    servicePeople: {
      sp1: { type: '产康师', assign: '吴小玲', usedTimes: '7', totalTimes: '10' },
      sp2: { type: '运动康复师', assign: '陈康复', usedTimes: '2', totalTimes: '4' },
      sp3: { type: '调理师', assign: '无', usedTimes: '0', totalTimes: '3' },
    },
  };
  assert.deepEqual(orderServiceRoleDisplay(order, '产康师'), { name: '吴小玲', count: '7/10', progress: '7/10', isPackage: true, usedTimes: 7, totalTimes: 10 });
  assert.deepEqual(orderServiceRoleDisplay(order, '运动康复师'), { name: '陈康复', count: '2/4', progress: '2/4', isPackage: true, usedTimes: 2, totalTimes: 4 });
  assert.deepEqual(orderServiceRoleDisplay(order, '调理师'), { name: '—', count: '—', progress: '—', isPackage: true, usedTimes: 0, totalTimes: 0 });
});

test('legacy order progress never leaks into exercise or conditioning counters', () => {
  const order = {
    type: '套餐',
    usedTimes: 6,
    totalTimes: 8,
    servicePeople: {
      sp1: { type: '产康师', assign: '产康甲' },
      sp2: { type: '运动康复师', assign: '运动乙', totalTimes: '3' },
      sp3: { type: '调理师', assign: '调理丙', totalTimes: '4' },
    },
  };
  assert.equal(orderServiceRoleDisplay(order, '产康师').usedTimes, 6);
  assert.deepEqual(orderServiceRoleDisplay(order, '运动康复师'), {
    name: '运动乙', count: '0/3', progress: '0/3', isPackage: true, usedTimes: 0, totalTimes: 3,
  });
  assert.deepEqual(orderServiceRoleDisplay(order, '调理师'), {
    name: '调理丙', count: '0/4', progress: '0/4', isPackage: true, usedTimes: 0, totalTimes: 4,
  });
});

test('order service role display supports legacy labels and experience-card status', () => {
  const order = {
    type: '体验卡',
    servicePeople: JSON.stringify({
      sp3: { type: '体质调理师', assign: '林调理', usedTimes: '1', totalTimes: '1' },
    }),
  };
  assert.deepEqual(orderServiceRoleDisplay(order, '调理师'), { name: '林调理', count: '1/1', progress: '已服务', isPackage: false, usedTimes: 1, totalTimes: 1 });
  assert.deepEqual(orderServiceRoleDisplay({ type: '套餐', servicePeople: '{invalid' }, '产康师'), { name: '—', count: '—', progress: '—', isPackage: true, usedTimes: 0, totalTimes: 0 });
  assert.match(ordersSource, /!service\.isPackage[\s\S]*?service\.status === '已服务'/,
    'experience cards must remain a status-only display without a count line');
});

test('service status and order list interval use each specialist completion time', () => {
  const now = new Date('2026-08-23T10:00:00+08:00');
  assert.deepEqual(
    servicePersonStatus(4, 8, '2026-08-18T10:00:00+08:00', now),
    { label: '服务中', detail: '间隔5天' },
  );
  assert.deepEqual(servicePersonStatus(8, 8, '2026-08-18T10:00:00+08:00', now), { label: '服务完结', detail: '' });
  assert.deepEqual(servicePersonStatus(0, 8, '', now), { label: '未服务', detail: '' });
  assert.equal(packageServiceStatusText(4, 8, '2026-08-18T10:00:00+08:00', now), '间隔5天');
  assert.equal(packageServiceStatusText(8, 8, '2026-08-18T10:00:00+08:00', now), '服务完结');
  assert.equal(packageServiceStatusText(0, 8, '', now), '未服务');
});

test('order editor restricts therapist options by discipline and shows independent status', () => {
  assert.match(ordersSource, /selectableTypes=\{\['产康师'\]\}/);
  assert.match(ordersSource, /selectableTypes=\{\['运动康复师'\]\}/);
  assert.match(ordersSource, /selectableTypes=\{\['产康师', '调理师'\]\}/);
  assert.match(ordersSource, /服务总次数[\s\S]*?已服务次数[\s\S]*?服务状态/);
  assert.match(ordersSource, /lastCompletedAtFor\(form\.servicePerson[123]\.assign\)/);
  assert.match(ordersSource, /data-order-service-count[\s\S]*?data-order-service-status/);
  assert.match(ordersSource, /data-order-service-cell className="h-8 flex flex-col/,
    'order service count/status must share a compact fixed-height cell');
});

test('order list city filter groups districts into their parent city', () => {
  assert.equal(matchesAppointmentCities('厦门市思明区湖滨南路', ['厦门']), true);
  assert.equal(matchesAppointmentCities('湖里区金山街道', ['厦门']), true);
  assert.equal(matchesAppointmentCities('晋江市陈埭镇', ['厦门']), false);
  assert.match(ordersSource, /matchesAppointmentCities\(o\.area, fArea\)/);
});

test('order therapist filter keeps discipline and therapist selections independent', () => {
  const order = {
    type: '套餐',
    servicePeople: {
      sp1: { type: '产康师', assign: '徐燕玲', usedTimes: '2', totalTimes: '8' },
      sp2: { type: '运动康复师', assign: '陈康复', usedTimes: '0', totalTimes: '4' },
      sp3: { type: '调理师', assign: '徐燕玲', usedTimes: '1', totalTimes: '3' },
    },
  };
  assert.equal(matchesOrderTherapists(order, [orderTherapistFilterValue('产康师', '徐燕玲')]), true);
  assert.equal(matchesOrderTherapists(order, [orderTherapistFilterValue('体质调理师', '徐燕玲')]), true);
  assert.equal(matchesOrderTherapists(order, [orderTherapistFilterValue('运动康复师', '徐燕玲')]), false);
  assert.equal(matchesOrderTherapists(order, [orderTherapistFilterValue('运动康复师', '陈康复')]), true);
  assert.match(ordersSource, /group: label/);
});

test('order service filter exposes mutually exclusive progress states', () => {
  const packageOrder = (usedTimes, totalTimes = 8) => ({
    type: '套餐',
    servicePeople: { sp1: { type: '产康师', assign: '徐燕玲', usedTimes, totalTimes } },
  });
  assert.equal(orderServiceFilterStatus(packageOrder(0)), '未服务');
  assert.equal(orderServiceFilterStatus(packageOrder(3)), '服务中');
  assert.equal(orderServiceFilterStatus(packageOrder(8)), '已服务');
  assert.equal(orderServiceFilterStatus({
    type: '体验卡',
    servicePeople: { sp1: { type: '产康师', assign: '徐燕玲', usedTimes: 1, totalTimes: 1 } },
  }), '已服务');
  assert.equal(matchesOrderServiceStatuses(packageOrder(3), ['未服务', '服务中']), true);
  assert.equal(matchesOrderServiceStatuses(packageOrder(8), ['未服务', '服务中']), false);
  assert.match(ordersSource, /label="服务"[\s\S]*?SERVICE_STATUS_FILTER_OPTIONS/);
  assert.doesNotMatch(ordersSource, /allSelectedLabel="跟进时间 全选"/);
});

test('order follow status filter supports all, single and multiple selections', () => {
  assert.deepEqual(ORDER_FOLLOW_STATUS_VALUES, ['跟进中', '待跟进', '已完成', '延迟']);
  assert.equal(matchesOrderFollowStatuses('跟进中', []), true);
  assert.equal(matchesOrderFollowStatuses('延迟', ['跟进中']), false);
  assert.equal(matchesOrderFollowStatuses('延迟', ['待跟进', '延迟']), true);
  assert.equal(matchesOrderFollowStatuses('已完成', [...ORDER_FOLLOW_STATUS_VALUES]), true);
  assert.equal(matchesOrderFollowStatuses('跟进中', ['__FILTER_NONE__']), false);
  assert.match(ordersSource, /label="跟进状态"[\s\S]*?FOLLOW_STATUS_FILTER_OPTIONS/);
  assert.match(ordersSource, /matchesOrderFollowStatuses\(followInfo\.status, fFollowStatus, FILTER_NONE\)/);
});

test('customer areas show two characters while retaining the full hover value', () => {
  assert.match(compactAreaSource, /Array\.from\(fullValue\)/);
  assert.match(compactAreaSource, /characters\.slice\(0, visibleCharacters\)/);
  assert.match(customersSource, /title=\{c\.area && c\.area !== '—' \? c\.area : undefined\}[\s\S]*?compactAreaLabel\(c\.area\)/);
  assert.match(ordersSource, /title=\{o\.area\}[\s\S]*?compactAreaLabel\(o\.area\)/);
});
