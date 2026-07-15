-- 产康运营管理平台数据库初始化脚本
-- 创建时间: 2025-06-25

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 用户表
CREATE TABLE `users` (
  `id` varchar(36) NOT NULL COMMENT '用户ID',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `name` varchar(50) NOT NULL COMMENT '姓名',
  `phone` varchar(20) DEFAULT NULL COMMENT '手机号',
  `email` varchar(100) DEFAULT NULL COMMENT '邮箱',
  `role` enum('superadmin','admin','service','therapist','finance') NOT NULL COMMENT '角色',
  `avatar` varchar(255) DEFAULT NULL COMMENT '头像URL',
  `status` enum('active','inactive','locked') DEFAULT 'active' COMMENT '状态',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_phone` (`phone`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

-- 客户表
CREATE TABLE `customers` (
  `id` varchar(36) NOT NULL COMMENT '客户ID',
  `customer_code` varchar(20) NOT NULL COMMENT '客户编号',
  `name` varchar(50) NOT NULL COMMENT '姓名',
  `wechat` varchar(50) DEFAULT NULL COMMENT '微信号',
  `phone` varchar(20) NOT NULL COMMENT '手机号',
  `area` varchar(100) DEFAULT NULL COMMENT '所在区域',
  `source` varchar(50) DEFAULT NULL COMMENT '客户来源',
  `acquired_at` date DEFAULT NULL COMMENT '获客日期',
  `tag` varchar(10) DEFAULT NULL COMMENT '客户标签',
  `follow_status` enum('待跟进','跟进中','已预约','已成交','已流失') DEFAULT '待跟进' COMMENT '跟进状态',
  `follow_date` date DEFAULT NULL COMMENT '下次跟进日期',
  `advisor_id` varchar(36) DEFAULT NULL COMMENT '归属客服ID',
  `total_orders` int DEFAULT 0 COMMENT '订单总数',
  `last_follow` datetime DEFAULT NULL COMMENT '最后跟进时间',
  `profile` json DEFAULT NULL COMMENT '客户画像',
  `situation` text COMMENT '客户情况',
  `intended_product` varchar(100) DEFAULT NULL COMMENT '意向产品',
  `remark` text COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_customer_code` (`customer_code`),
  KEY `idx_phone` (`phone`),
  KEY `idx_advisor` (`advisor_id`),
  KEY `idx_tag` (`tag`),
  KEY `idx_follow_status` (`follow_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客户表';

-- 订单表
CREATE TABLE `orders` (
  `id` varchar(36) NOT NULL COMMENT '订单ID',
  `order_no` varchar(50) NOT NULL COMMENT '订单编号',
  `customer_id` varchar(36) NOT NULL COMMENT '客户ID',
  `type` enum('体验卡','套餐') NOT NULL COMMENT '订单类型',
  `amount` decimal(10,2) NOT NULL COMMENT '订单金额',
  `pay_status` enum('已付款','待付款','已退款','已付定金') DEFAULT '待付款' COMMENT '支付状态',
  `paid_at` datetime DEFAULT NULL COMMENT '支付时间',
  `used_times` int DEFAULT 0 COMMENT '已使用次数',
  `total_times` int NOT NULL COMMENT '总次数',
  `manual_progress_at` datetime DEFAULT NULL COMMENT '服务进度人工校正时间',
  `is_upgrade` tinyint(1) DEFAULT 0 COMMENT '是否升单',
  `contract_signed` tinyint(1) DEFAULT 0 COMMENT '是否签合同',
  `has_coupon` tinyint(1) DEFAULT 0 COMMENT '是否有抵扣券',
  `service_item_count` int DEFAULT 1 COMMENT '服务项目数量',
  `service_items` varchar(500) DEFAULT NULL COMMENT '服务项目名称',
  `service_people` json DEFAULT NULL COMMENT '服务人员分配',
  `appointment_time` varchar(50) DEFAULT NULL COMMENT '预约时间',
  `service_note` text DEFAULT NULL COMMENT '服务备注',
  `contract_attachments` json DEFAULT NULL COMMENT '合同附件',
  `service_photo_records` json DEFAULT NULL COMMENT '服务照片记录',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_pay_status` (`pay_status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_customer_created_at` (`customer_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='订单表';

-- 预约表
CREATE TABLE `appointments` (
  `id` varchar(36) NOT NULL COMMENT '预约ID',
  `appointment_no` varchar(50) NOT NULL COMMENT '预约编号',
  `customer_id` varchar(36) NOT NULL COMMENT '客户ID',
  `therapist_id` varchar(36) NOT NULL COMMENT '技师ID',
  `date` date NOT NULL COMMENT '预约日期',
  `time_slot` varchar(20) NOT NULL COMMENT '时间段',
  `service` text COMMENT '服务项目',
  `status` enum('已确认','待确认','已取消','已完成') DEFAULT '待确认' COMMENT '状态',
  `area` varchar(100) DEFAULT NULL COMMENT '服务区域',
  `remark` text COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_appointment_no` (`appointment_no`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_therapist` (`therapist_id`),
  KEY `idx_date` (`date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预约表';

-- 技师表
CREATE TABLE `therapists` (
  `id` varchar(36) NOT NULL COMMENT '技师ID',
  `name` varchar(50) NOT NULL COMMENT '姓名',
  `therapist_type` varchar(50) DEFAULT '产康师' COMMENT '技师类型',
  `birth_year` varchar(4) DEFAULT NULL COMMENT '出生年份',
  `phone` varchar(20) NOT NULL COMMENT '手机号',
  `area` text COMMENT '可接单范围',
  `city` enum('厦门','泉州','漳州') NOT NULL COMMENT '所在城市',
  `detail_address` varchar(255) DEFAULT NULL COMMENT '详细地址',
  `services` json DEFAULT NULL COMMENT '服务项目',
  `service_method` text COMMENT '服务方式描述',
  `characteristics` text COMMENT '技师特点',
  `transport` varchar(50) DEFAULT NULL COMMENT '交通方式',
  `status` enum('在职','离职','休假') DEFAULT '在职' COMMENT '状态',
  `orders` int DEFAULT 0 COMMENT '订单数',
  `rating` decimal(2,1) DEFAULT 5.0 COMMENT '服务评分',
  `upgrade_rate` int DEFAULT 0 COMMENT '升单率(%)',
  `star_level` int DEFAULT 1 COMMENT '星级',
  `health_cert` json DEFAULT NULL COMMENT '健康证',
  `first_aid_cert` json DEFAULT NULL COMMENT '急救证',
  `labor_cert` json DEFAULT NULL COMMENT '人社局证书',
  `association_cert` json DEFAULT NULL COMMENT '协会证书',
  `remark` text COMMENT '备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_phone` (`phone`),
  KEY `idx_city` (`city`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='技师表';

-- 服务记录表
CREATE TABLE `service_records` (
  `id` varchar(36) NOT NULL COMMENT '记录ID',
  `appointment_id` varchar(36) NOT NULL COMMENT '预约ID',
  `customer_id` varchar(36) NOT NULL COMMENT '客户ID',
  `therapist_id` varchar(36) NOT NULL COMMENT '技师ID',
  `service_date` datetime NOT NULL COMMENT '服务日期',
  `service_items` text COMMENT '服务项目',
  `duration` int DEFAULT NULL COMMENT '服务时长(分钟)',
  `feedback` text COMMENT '客户反馈',
  `photos` json DEFAULT NULL COMMENT '服务照片',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_appointment` (`appointment_id`),
  KEY `idx_customer` (`customer_id`),
  KEY `idx_therapist` (`therapist_id`),
  KEY `idx_service_date` (`service_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='服务记录表';

-- 工资记录表
CREATE TABLE `salary_records` (
  `id` varchar(36) NOT NULL COMMENT '记录ID',
  `therapist_id` varchar(36) NOT NULL COMMENT '技师ID',
  `month` varchar(7) NOT NULL COMMENT '月份(YYYY-MM)',
  `service_count` int DEFAULT 0 COMMENT '服务次数',
  `labor_fee` decimal(10,2) DEFAULT 0 COMMENT '手工费',
  `commission` decimal(10,2) DEFAULT 0 COMMENT '提成',
  `total` decimal(10,2) DEFAULT 0 COMMENT '总额',
  `status` enum('待结算','审核中','已结算') DEFAULT '待结算' COMMENT '状态',
  `settled_at` datetime DEFAULT NULL COMMENT '结算时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_therapist_month` (`therapist_id`,`month`),
  KEY `idx_month` (`month`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工资记录表';

-- 操作日志表
CREATE TABLE `operation_logs` (
  `id` varchar(36) NOT NULL COMMENT '日志ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `username` varchar(50) NOT NULL COMMENT '用户名',
  `action` varchar(50) NOT NULL COMMENT '操作类型',
  `module` varchar(50) NOT NULL COMMENT '模块',
  `description` text COMMENT '描述',
  `ip_address` varchar(50) DEFAULT NULL COMMENT 'IP地址',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_module` (`module`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='操作日志表';

-- 默认管理员由后端首次启动时 seedIfEmpty() 自动插入
-- 默认账号: admin / admin123 （首次登录后请立即在系统设置中修改密码）

SET FOREIGN_KEY_CHECKS = 1;
