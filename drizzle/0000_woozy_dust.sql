CREATE TABLE "ai_recommendation_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"period_month" smallint NOT NULL,
	"period_year" smallint NOT NULL,
	"requests_used" integer DEFAULT 0 NOT NULL,
	"max_monthly_quota" integer DEFAULT 0 NOT NULL,
	"last_request_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ai_quotas_store_period" UNIQUE("store_id","period_year","period_month"),
	CONSTRAINT "chk_ai_recommendation_quotas_period_month" CHECK ("ai_recommendation_quotas"."period_month" BETWEEN 1 AND 12),
	CONSTRAINT "chk_ai_recommendation_quotas_period_year" CHECK ("ai_recommendation_quotas"."period_year" >= 2024),
	CONSTRAINT "chk_ai_recommendation_quotas_requests_used" CHECK ("ai_recommendation_quotas"."requests_used" >= 0),
	CONSTRAINT "chk_ai_recommendation_quotas_max_monthly_quota" CHECK ("ai_recommendation_quotas"."max_monthly_quota" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"entity_name" varchar(50) NOT NULL,
	"entity_id" uuid,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rus_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" smallint NOT NULL,
	"monthly_income_cap" numeric(12, 2) NOT NULL,
	"monthly_purchases_cap" numeric(12, 2) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_rus_categories_period" UNIQUE("category","valid_from"),
	CONSTRAINT "chk_rus_categories_category" CHECK ("rus_categories"."category" in (1, 2)),
	CONSTRAINT "chk_rus_categories_monthly_income_cap" CHECK ("rus_categories"."monthly_income_cap" > 0),
	CONSTRAINT "chk_rus_categories_monthly_purchases_cap" CHECK ("rus_categories"."monthly_purchases_cap" > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_categories_store_name" UNIQUE("store_id","name")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"movement_type" varchar(30) NOT NULL,
	"reference_id" uuid,
	"quantity" numeric(10, 3) NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"total_cost" numeric(12, 2) NOT NULL,
	"stock_after" numeric(10, 3) NOT NULL,
	"average_cost_after" numeric(12, 4) NOT NULL,
	"notes" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_inventory_movements_movement_type" CHECK ("inventory_movements"."movement_type" in ('PURCHASE_ENTRY', 'SALE_EXIT', 'WASTE_LOSS', 'COUNT_ADJUSTMENT', 'CUSTOMER_RETURN')),
	CONSTRAINT "chk_inventory_movements_quantity" CHECK ("inventory_movements"."quantity" <> 0),
	CONSTRAINT "chk_inventory_movements_unit_cost" CHECK ("inventory_movements"."unit_cost" >= 0),
	CONSTRAINT "chk_inventory_movements_stock_after" CHECK ("inventory_movements"."stock_after" >= 0),
	CONSTRAINT "chk_inventory_movements_average_cost_after" CHECK ("inventory_movements"."average_cost_after" >= 0),
	CONSTRAINT "chk_inventory_reason" CHECK ("inventory_movements"."movement_type" NOT IN ('WASTE_LOSS', 'COUNT_ADJUSTMENT') OR "inventory_movements"."notes" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "product_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"old_cash_price" numeric(12, 2) NOT NULL,
	"new_cash_price" numeric(12, 2) NOT NULL,
	"old_credit_price" numeric(12, 2) NOT NULL,
	"new_credit_price" numeric(12, 2) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid,
	"unit_id" uuid NOT NULL,
	"default_supplier_id" uuid,
	"sku" varchar(50),
	"barcode" varchar(50),
	"name" varchar(150) NOT NULL,
	"description" text,
	"brand" varchar(100),
	"is_service" boolean DEFAULT false NOT NULL,
	"current_stock" numeric(10, 3) DEFAULT '0.000' NOT NULL,
	"minimum_stock" numeric(10, 3) DEFAULT '0.000' NOT NULL,
	"cash_price" numeric(12, 2) NOT NULL,
	"credit_price" numeric(12, 2) NOT NULL,
	"allows_installments" boolean DEFAULT false NOT NULL,
	"current_average_cost" numeric(12, 4) DEFAULT '0.0000' NOT NULL,
	"image_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_products_current_stock" CHECK ("products"."current_stock" >= 0),
	CONSTRAINT "chk_products_minimum_stock" CHECK ("products"."minimum_stock" >= 0),
	CONSTRAINT "chk_products_cash_price" CHECK ("products"."cash_price" > 0),
	CONSTRAINT "chk_products_credit_price" CHECK ("products"."credit_price" >= "products"."cash_price"),
	CONSTRAINT "chk_products_current_average_cost" CHECK ("products"."current_average_cost" >= 0),
	CONSTRAINT "chk_products_service_stock" CHECK (NOT "products"."is_service" OR ("products"."current_stock" = 0 AND "products"."minimum_stock" = 0))
);
--> statement-breakpoint
CREATE TABLE "purchase_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_purchase_attachments_file_size" CHECK ("purchase_attachments"."file_size" BETWEEN 1 AND 5242880),
	CONSTRAINT "chk_purchase_attachments_mime_type" CHECK ("purchase_attachments"."mime_type" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf'))
);
--> statement-breakpoint
CREATE TABLE "purchase_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit_cost" numeric(12, 4) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	CONSTRAINT "chk_purchase_items_quantity" CHECK ("purchase_items"."quantity" > 0),
	CONSTRAINT "chk_purchase_items_unit_cost" CHECK ("purchase_items"."unit_cost" > 0),
	CONSTRAINT "chk_purchase_items_subtotal" CHECK ("purchase_items"."subtotal" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	CONSTRAINT "uq_purchase_order_items_product" UNIQUE("purchase_order_id","product_id"),
	CONSTRAINT "chk_purchase_order_items_quantity" CHECK ("purchase_order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_id" uuid,
	"user_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_purchase_orders_status" CHECK ("purchase_orders"."status" in ('DRAFT', 'SENT', 'RECEIVED', 'CANCELED'))
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"document_type" varchar(20) NOT NULL,
	"series" varchar(10),
	"document_number" varchar(20) NOT NULL,
	"issue_date" date NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_purchases_document_type" CHECK ("purchases"."document_type" in ('FACTURA', 'BOLETA', 'GUIA_REMISION', 'RECIBO')),
	CONSTRAINT "chk_purchases_total_amount" CHECK ("purchases"."total_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"tax_id_number" varchar(15) NOT NULL,
	"trade_name" varchar(150) NOT NULL,
	"contact_name" varchar(100),
	"phone" varchar(20),
	"email" varchar(150),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_suppliers_store_tax_id" UNIQUE("store_id","tax_id_number")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(50) NOT NULL,
	"allow_decimals" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_units_store_code" UNIQUE("store_id","code")
);
--> statement-breakpoint
CREATE TABLE "credit_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"currency" varchar(3) DEFAULT 'PEN' NOT NULL,
	"credit_limit" numeric(12, 2) NOT NULL,
	"current_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"compensatory_rate_type" varchar(10) NOT NULL,
	"compensatory_rate_value" numeric(7, 4) NOT NULL,
	"compensatory_period" varchar(10) DEFAULT 'MONTHLY' NOT NULL,
	"compensatory_capitalization" varchar(10),
	"moratory_rate_type" varchar(10) NOT NULL,
	"moratory_rate_value" numeric(7, 4) NOT NULL,
	"moratory_period" varchar(10) DEFAULT 'DAILY' NOT NULL,
	"moratory_capitalization" varchar(10),
	"max_installment_months" smallint DEFAULT 6 NOT NULL,
	"cut_off_day" smallint NOT NULL,
	"payment_due_day" smallint NOT NULL,
	"internal_credit_score" smallint DEFAULT 100 NOT NULL,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_accounts_customer_id_unique" UNIQUE("customer_id"),
	CONSTRAINT "chk_credit_accounts_currency" CHECK ("credit_accounts"."currency" in ('PEN', 'USD')),
	CONSTRAINT "chk_credit_accounts_credit_limit" CHECK ("credit_accounts"."credit_limit" > 0),
	CONSTRAINT "chk_credit_accounts_current_balance" CHECK ("credit_accounts"."current_balance" >= 0),
	CONSTRAINT "chk_credit_accounts_compensatory_rate_type" CHECK ("credit_accounts"."compensatory_rate_type" in ('EFFECTIVE', 'NOMINAL')),
	CONSTRAINT "chk_credit_accounts_compensatory_rate_value" CHECK ("credit_accounts"."compensatory_rate_value" >= 0),
	CONSTRAINT "chk_credit_accounts_compensatory_period" CHECK ("credit_accounts"."compensatory_period" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_accounts_compensatory_capitalization_value" CHECK ("credit_accounts"."compensatory_capitalization" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_accounts_moratory_rate_type" CHECK ("credit_accounts"."moratory_rate_type" in ('EFFECTIVE', 'NOMINAL')),
	CONSTRAINT "chk_credit_accounts_moratory_rate_value" CHECK ("credit_accounts"."moratory_rate_value" >= 0),
	CONSTRAINT "chk_credit_accounts_moratory_period" CHECK ("credit_accounts"."moratory_period" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_accounts_moratory_capitalization_value" CHECK ("credit_accounts"."moratory_capitalization" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_accounts_max_installment_months" CHECK ("credit_accounts"."max_installment_months" BETWEEN 1 AND 24),
	CONSTRAINT "chk_credit_accounts_cut_off_day" CHECK ("credit_accounts"."cut_off_day" BETWEEN 1 AND 28),
	CONSTRAINT "chk_credit_accounts_payment_due_day" CHECK ("credit_accounts"."payment_due_day" BETWEEN 1 AND 28),
	CONSTRAINT "chk_credit_accounts_internal_credit_score" CHECK ("credit_accounts"."internal_credit_score" BETWEEN 0 AND 100),
	CONSTRAINT "chk_credit_accounts_status" CHECK ("credit_accounts"."status" in ('ACTIVE', 'SUSPENDED', 'BLOCKED')),
	CONSTRAINT "chk_credit_compensatory_capitalization" CHECK (("credit_accounts"."compensatory_rate_type" = 'NOMINAL') = ("credit_accounts"."compensatory_capitalization" IS NOT NULL)),
	CONSTRAINT "chk_credit_moratory_capitalization" CHECK (("credit_accounts"."moratory_rate_type" = 'NOMINAL') = ("credit_accounts"."moratory_capitalization" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "credit_rate_caps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rate_kind" varchar(15) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"max_effective_annual_rate" numeric(7, 4) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"source_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_rate_caps_period" UNIQUE("rate_kind","currency","valid_from"),
	CONSTRAINT "chk_credit_rate_caps_rate_kind" CHECK ("credit_rate_caps"."rate_kind" in ('COMPENSATORY', 'MORATORY')),
	CONSTRAINT "chk_credit_rate_caps_currency" CHECK ("credit_rate_caps"."currency" in ('PEN', 'USD')),
	CONSTRAINT "chk_credit_rate_caps_max_rate" CHECK ("credit_rate_caps"."max_effective_annual_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "customer_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"consent_type" varchar(50) NOT NULL,
	"policy_version" varchar(20) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_text" text NOT NULL,
	CONSTRAINT "chk_customer_consents_consent_type" CHECK ("customer_consents"."consent_type" in ('DATA_PROTECTION_LAW_29733', 'CREDIT_TERMS'))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid,
	"document_type" varchar(10) NOT NULL,
	"document_number" varchar(15) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(20),
	"email" varchar(150) NOT NULL,
	"email_bounced_at" timestamp with time zone,
	"preferred_locale" varchar(2),
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_customers_store_document" UNIQUE("store_id","document_type","document_number"),
	CONSTRAINT "chk_customers_document_type" CHECK ("customers"."document_type" in ('DNI', 'CE', 'PASAPORTE')),
	CONSTRAINT "chk_customers_preferred_locale" CHECK ("customers"."preferred_locale" in ('es', 'en', 'qu')),
	CONSTRAINT "chk_customers_dni" CHECK ("customers"."document_type" <> 'DNI' OR "customers"."document_number" ~ '^[0-9]{8}$')
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(30) NOT NULL,
	"password" varchar(255),
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_accounts_provider_account" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "store_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"plan_tier" varchar(20) DEFAULT 'CASERO' NOT NULL,
	"billing_interval" varchar(10),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"mp_preapproval_id" varchar(100),
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_subscriptions_store_id_unique" UNIQUE("store_id"),
	CONSTRAINT "store_subscriptions_mp_preapproval_id_unique" UNIQUE("mp_preapproval_id"),
	CONSTRAINT "chk_store_subscriptions_plan_tier" CHECK ("store_subscriptions"."plan_tier" in ('CASERO', 'BODEGA_PRO', 'NEGOCIO_PLUS')),
	CONSTRAINT "chk_store_subscriptions_billing_interval" CHECK ("store_subscriptions"."billing_interval" in ('MONTHLY', 'YEARLY')),
	CONSTRAINT "chk_store_subscriptions_status" CHECK ("store_subscriptions"."status" in ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED')),
	CONSTRAINT "chk_subscription_trial" CHECK ("store_subscriptions"."status" <> 'TRIALING' OR "store_subscriptions"."trial_ends_at" IS NOT NULL),
	CONSTRAINT "chk_subscription_paid_plan" CHECK ("store_subscriptions"."plan_tier" = 'CASERO' OR "store_subscriptions"."status" <> 'ACTIVE'
        OR ("store_subscriptions"."billing_interval" IS NOT NULL AND "store_subscriptions"."current_period_end" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commercial_name" varchar(150) NOT NULL,
	"business_turn" varchar(50) NOT NULL,
	"tax_id_type" varchar(10) NOT NULL,
	"tax_id_number" varchar(15) NOT NULL,
	"owner_full_name" varchar(150) NOT NULL,
	"contact_email" varchar(150) NOT NULL,
	"contact_phone" varchar(20),
	"address" text,
	"tax_regime" varchar(30) DEFAULT 'NUEVO_RUS' NOT NULL,
	"rus_category" smallint DEFAULT 1 NOT NULL,
	"yape_number" varchar(15),
	"plin_number" varchar(15),
	"bank_name" varchar(60),
	"bank_account_number" varchar(30),
	"bank_cci" varchar(20),
	"payment_qr_path" text,
	"default_locale" varchar(2) DEFAULT 'es' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stores_tax_id_number_unique" UNIQUE("tax_id_number"),
	CONSTRAINT "stores_contact_email_unique" UNIQUE("contact_email"),
	CONSTRAINT "chk_stores_tax_id_type" CHECK ("stores"."tax_id_type" in ('RUC', 'DNI')),
	CONSTRAINT "chk_stores_tax_regime" CHECK ("stores"."tax_regime" in ('NUEVO_RUS', 'RER', 'MYPE', 'GENERAL')),
	CONSTRAINT "chk_stores_rus_category" CHECK ("stores"."rus_category" in (1, 2)),
	CONSTRAINT "chk_stores_default_locale" CHECK ("stores"."default_locale" in ('es', 'en', 'qu'))
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"mp_payment_id" varchar(100) NOT NULL,
	"plan_tier" varchar(20) NOT NULL,
	"billing_interval" varchar(10) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'PEN' NOT NULL,
	"status" varchar(20) NOT NULL,
	"paid_at" timestamp with time zone,
	"receipt_url" text,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_payments_mp_payment_id_unique" UNIQUE("mp_payment_id"),
	CONSTRAINT "chk_subscription_payments_plan_tier" CHECK ("subscription_payments"."plan_tier" in ('BODEGA_PRO', 'NEGOCIO_PLUS')),
	CONSTRAINT "chk_subscription_payments_billing_interval" CHECK ("subscription_payments"."billing_interval" in ('MONTHLY', 'YEARLY')),
	CONSTRAINT "chk_subscription_payments_amount" CHECK ("subscription_payments"."amount" > 0),
	CONSTRAINT "chk_subscription_payments_status" CHECK ("subscription_payments"."status" in ('APPROVED', 'REJECTED', 'REFUNDED'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(150) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"store_id" uuid,
	"role" varchar(20) NOT NULL,
	"phone" varchar(20),
	"preferred_locale" varchar(2) DEFAULT 'es' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "chk_users_role" CHECK ("users"."role" in ('PLATFORM_ADMIN', 'STORE_OWNER', 'STORE_EMPLOYEE', 'CUSTOMER', 'PENDING_OWNER')),
	CONSTRAINT "chk_users_preferred_locale" CHECK ("users"."preferred_locale" in ('es', 'en', 'qu')),
	CONSTRAINT "chk_users_failed_login_attempts" CHECK ("users"."failed_login_attempts" >= 0),
	CONSTRAINT "chk_users_store_role" CHECK (("users"."role" IN ('STORE_OWNER', 'STORE_EMPLOYEE') AND "users"."store_id" IS NOT NULL)
        OR ("users"."role" IN ('PLATFORM_ADMIN', 'CUSTOMER', 'PENDING_OWNER') AND "users"."store_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"unit_cost_snapshot" numeric(12, 4) NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	CONSTRAINT "chk_sale_items_quantity" CHECK ("sale_items"."quantity" > 0),
	CONSTRAINT "chk_sale_items_unit_price" CHECK ("sale_items"."unit_price" > 0),
	CONSTRAINT "chk_sale_items_unit_cost_snapshot" CHECK ("sale_items"."unit_cost_snapshot" >= 0),
	CONSTRAINT "chk_sale_items_subtotal" CHECK ("sale_items"."subtotal" > 0)
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id_cashier" uuid NOT NULL,
	"customer_id" uuid,
	"sale_modality" varchar(30) NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"amount_received" numeric(12, 2),
	"change_given" numeric(12, 2),
	"total_cost" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"profit_margin" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"sale_date" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_sales_sale_modality" CHECK ("sales"."sale_modality" in ('CASH', 'SINGLE_PAYMENT_CREDIT', 'INSTALLMENTS_CREDIT')),
	CONSTRAINT "chk_sales_payment_method" CHECK ("sales"."payment_method" in ('CASH', 'YAPE', 'PLIN', 'CARD', 'CREDIT')),
	CONSTRAINT "chk_sales_total_amount" CHECK ("sales"."total_amount" > 0),
	CONSTRAINT "chk_sales_change_given" CHECK ("sales"."change_given" >= 0),
	CONSTRAINT "chk_sales_modality_payment" CHECK (("sales"."sale_modality" = 'CASH' AND "sales"."payment_method" <> 'CREDIT')
        OR ("sales"."sale_modality" <> 'CASH' AND "sales"."payment_method" = 'CREDIT' AND "sales"."customer_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "credit_charge_voids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"credit_charge_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"applied_cycle_id" uuid NOT NULL,
	"voided_amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_charge_voids_credit_charge_id_unique" UNIQUE("credit_charge_id"),
	CONSTRAINT "chk_credit_charge_voids_voided_amount" CHECK ("credit_charge_voids"."voided_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "credit_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"settlement_cycle_id" uuid NOT NULL,
	"charge_modality" varchar(20) NOT NULL,
	"purchase_date" timestamp with time zone NOT NULL,
	"principal_amount" numeric(12, 2) NOT NULL,
	"installments_count" smallint,
	"grace_days" smallint,
	"capitalized_amount" numeric(12, 2),
	"compensatory_rate_type" varchar(10) NOT NULL,
	"compensatory_rate_value" numeric(7, 4) NOT NULL,
	"compensatory_period" varchar(10) NOT NULL,
	"compensatory_capitalization" varchar(10),
	"moratory_rate_type" varchar(10) NOT NULL,
	"moratory_rate_value" numeric(7, 4) NOT NULL,
	"moratory_period" varchar(10) NOT NULL,
	"moratory_capitalization" varchar(10),
	"compensatory_interest" numeric(12, 2),
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"consent_status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"consent_deadline" timestamp with time zone,
	"notified_at" timestamp with time zone,
	"objected_at" timestamp with time zone,
	"objection_note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_charges_sale_id_unique" UNIQUE("sale_id"),
	CONSTRAINT "chk_credit_charges_charge_modality" CHECK ("credit_charges"."charge_modality" in ('SINGLE_PAYMENT', 'INSTALLMENTS')),
	CONSTRAINT "chk_credit_charges_principal_amount" CHECK ("credit_charges"."principal_amount" > 0),
	CONSTRAINT "chk_credit_charges_installments_count" CHECK ("credit_charges"."installments_count" BETWEEN 1 AND 24),
	CONSTRAINT "chk_credit_charges_grace_days" CHECK ("credit_charges"."grace_days" >= 0),
	CONSTRAINT "chk_credit_charges_compensatory_rate_type" CHECK ("credit_charges"."compensatory_rate_type" in ('EFFECTIVE', 'NOMINAL')),
	CONSTRAINT "chk_credit_charges_compensatory_rate_value" CHECK ("credit_charges"."compensatory_rate_value" >= 0),
	CONSTRAINT "chk_credit_charges_compensatory_period" CHECK ("credit_charges"."compensatory_period" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_charges_compensatory_capitalization" CHECK ("credit_charges"."compensatory_capitalization" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_charges_moratory_rate_type" CHECK ("credit_charges"."moratory_rate_type" in ('EFFECTIVE', 'NOMINAL')),
	CONSTRAINT "chk_credit_charges_moratory_rate_value" CHECK ("credit_charges"."moratory_rate_value" >= 0),
	CONSTRAINT "chk_credit_charges_moratory_period" CHECK ("credit_charges"."moratory_period" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_charges_moratory_capitalization" CHECK ("credit_charges"."moratory_capitalization" in ('ANNUAL', 'MONTHLY', 'DAILY')),
	CONSTRAINT "chk_credit_charges_compensatory_interest" CHECK ("credit_charges"."compensatory_interest" >= 0),
	CONSTRAINT "chk_credit_charges_status" CHECK ("credit_charges"."status" in ('PENDING', 'BILLED', 'PAID', 'VOIDED')),
	CONSTRAINT "chk_credit_charges_consent_status" CHECK ("credit_charges"."consent_status" in ('PENDING', 'ACCEPTED', 'OBJECTED')),
	CONSTRAINT "chk_charges_installments" CHECK (("credit_charges"."charge_modality" = 'INSTALLMENTS'
          AND "credit_charges"."installments_count" IS NOT NULL AND "credit_charges"."grace_days" IS NOT NULL AND "credit_charges"."capitalized_amount" IS NOT NULL)
        OR ("credit_charges"."charge_modality" = 'SINGLE_PAYMENT'
          AND "credit_charges"."installments_count" IS NULL AND "credit_charges"."grace_days" IS NULL AND "credit_charges"."capitalized_amount" IS NULL)),
	CONSTRAINT "chk_charges_objection" CHECK ("credit_charges"."consent_status" <> 'OBJECTED' OR "credit_charges"."objected_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "credit_installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"credit_charge_id" uuid NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"installment_number" smallint NOT NULL,
	"total_installments" smallint NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"initial_balance" numeric(12, 2) NOT NULL,
	"principal_amount" numeric(12, 2) NOT NULL,
	"compensatory_interest" numeric(12, 2) NOT NULL,
	"total_installment_amount" numeric(12, 2) NOT NULL,
	"remaining_balance" numeric(12, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_installments_charge_number" UNIQUE("credit_charge_id","installment_number"),
	CONSTRAINT "chk_credit_installments_installment_number" CHECK ("credit_installments"."installment_number" > 0),
	CONSTRAINT "chk_credit_installments_total_installments" CHECK ("credit_installments"."total_installments" >= "credit_installments"."installment_number"),
	CONSTRAINT "chk_credit_installments_status" CHECK ("credit_installments"."status" in ('PENDING', 'PAID', 'OVERDUE', 'VOIDED'))
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"settlement_cycle_id" uuid NOT NULL,
	"user_id_collector" uuid NOT NULL,
	"payment_method" varchar(20) NOT NULL,
	"amount_paid" numeric(12, 2) NOT NULL,
	"compensatory_interest_paid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"moratory_interest_paid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"principal_paid" numeric(12, 2) NOT NULL,
	"days_late" smallint DEFAULT 0 NOT NULL,
	"payment_date" timestamp with time zone DEFAULT now() NOT NULL,
	"receipt_number" varchar(50) NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_payments_store_receipt" UNIQUE("store_id","receipt_number"),
	CONSTRAINT "chk_debt_payments_payment_method" CHECK ("debt_payments"."payment_method" in ('CASH', 'YAPE', 'PLIN', 'TRANSFER')),
	CONSTRAINT "chk_debt_payments_amount_paid" CHECK ("debt_payments"."amount_paid" > 0),
	CONSTRAINT "chk_debt_payments_compensatory_interest_paid" CHECK ("debt_payments"."compensatory_interest_paid" >= 0),
	CONSTRAINT "chk_debt_payments_moratory_interest_paid" CHECK ("debt_payments"."moratory_interest_paid" >= 0),
	CONSTRAINT "chk_debt_payments_principal_paid" CHECK ("debt_payments"."principal_paid" >= 0),
	CONSTRAINT "chk_debt_payments_days_late" CHECK ("debt_payments"."days_late" >= 0),
	CONSTRAINT "chk_payments_breakdown" CHECK ("debt_payments"."amount_paid" = "debt_payments"."principal_paid" + "debt_payments"."compensatory_interest_paid" + "debt_payments"."moratory_interest_paid")
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"debt_payment_id" uuid NOT NULL,
	"credit_charge_id" uuid,
	"credit_installment_id" uuid,
	"allocation_type" varchar(25) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_payment_allocations_allocation_type" CHECK ("payment_allocations"."allocation_type" in ('PRINCIPAL', 'COMPENSATORY_INTEREST', 'MORATORY_INTEREST')),
	CONSTRAINT "chk_payment_allocations_amount" CHECK ("payment_allocations"."amount" > 0),
	CONSTRAINT "chk_allocations_target" CHECK (("payment_allocations"."credit_charge_id" IS NOT NULL)::INT + ("payment_allocations"."credit_installment_id" IS NOT NULL)::INT = 1)
);
--> statement-breakpoint
CREATE TABLE "settlement_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"credit_account_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"period_month" smallint NOT NULL,
	"period_year" smallint NOT NULL,
	"cut_off_date" timestamp with time zone NOT NULL,
	"payment_due_date" timestamp with time zone NOT NULL,
	"opening_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"purchases_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"installments_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"compensatory_interest_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"moratory_interest_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"adjustments_total" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"total_due" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"status" varchar(20) DEFAULT 'OPEN' NOT NULL,
	"statement_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cycles_account_number" UNIQUE("credit_account_id","cycle_number"),
	CONSTRAINT "uq_cycles_account_period" UNIQUE("credit_account_id","period_year","period_month"),
	CONSTRAINT "chk_settlement_cycles_cycle_number" CHECK ("settlement_cycles"."cycle_number" > 0),
	CONSTRAINT "chk_settlement_cycles_period_month" CHECK ("settlement_cycles"."period_month" BETWEEN 1 AND 12),
	CONSTRAINT "chk_settlement_cycles_period_year" CHECK ("settlement_cycles"."period_year" >= 2024),
	CONSTRAINT "chk_settlement_cycles_adjustments_total" CHECK ("settlement_cycles"."adjustments_total" >= 0),
	CONSTRAINT "chk_settlement_cycles_status" CHECK ("settlement_cycles"."status" in ('OPEN', 'BILLED', 'PAID', 'OVERDUE')),
	CONSTRAINT "chk_cycles_dates" CHECK ("settlement_cycles"."payment_due_date" > "settlement_cycles"."cut_off_date")
);
--> statement-breakpoint
CREATE TABLE "notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid,
	"customer_id" uuid,
	"user_id" uuid,
	"notification_type" varchar(30) NOT NULL,
	"recipient_email" varchar(150) NOT NULL,
	"locale" varchar(2) DEFAULT 'es' NOT NULL,
	"reference_type" varchar(30),
	"reference_id" uuid,
	"digest_date" date,
	"provider_message_id" varchar(100),
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_logs_provider_message_id_unique" UNIQUE("provider_message_id"),
	CONSTRAINT "chk_notification_logs_notification_type" CHECK ("notification_logs"."notification_type" in ('CHARGE_DIGEST', 'CYCLE_STATEMENT', 'PAYMENT_REMINDER', 'LATE_PAYMENT', 'PAYMENT_RECEIPT', 'WELCOME', 'EMAIL_OTP', 'MAGIC_LINK', 'PASSWORD_RESET', 'ACCOUNT_LOCKED', 'EMPLOYEE_INVITE', 'SUBSCRIPTION')),
	CONSTRAINT "chk_notification_logs_locale" CHECK ("notification_logs"."locale" in ('es', 'en', 'qu')),
	CONSTRAINT "chk_notification_logs_status" CHECK ("notification_logs"."status" in ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED')),
	CONSTRAINT "chk_notifications_digest" CHECK (("notification_logs"."notification_type" = 'CHARGE_DIGEST') = ("notification_logs"."digest_date" IS NOT NULL AND "notification_logs"."customer_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai_recommendation_quotas" ADD CONSTRAINT "ai_recommendation_quotas_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_supplier_id_suppliers_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_accounts" ADD CONSTRAINT "credit_accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_subscriptions" ADD CONSTRAINT "store_subscriptions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_store_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."store_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_cashier_users_id_fk" FOREIGN KEY ("user_id_cashier") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charge_voids" ADD CONSTRAINT "credit_charge_voids_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charge_voids" ADD CONSTRAINT "credit_charge_voids_credit_charge_id_credit_charges_id_fk" FOREIGN KEY ("credit_charge_id") REFERENCES "public"."credit_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charge_voids" ADD CONSTRAINT "credit_charge_voids_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charge_voids" ADD CONSTRAINT "credit_charge_voids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charge_voids" ADD CONSTRAINT "credit_charge_voids_applied_cycle_id_settlement_cycles_id_fk" FOREIGN KEY ("applied_cycle_id") REFERENCES "public"."settlement_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_credit_account_id_credit_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_settlement_cycle_id_settlement_cycles_id_fk" FOREIGN KEY ("settlement_cycle_id") REFERENCES "public"."settlement_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_charges" ADD CONSTRAINT "credit_charges_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_credit_charge_id_credit_charges_id_fk" FOREIGN KEY ("credit_charge_id") REFERENCES "public"."credit_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_credit_account_id_credit_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_credit_account_id_credit_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_settlement_cycle_id_settlement_cycles_id_fk" FOREIGN KEY ("settlement_cycle_id") REFERENCES "public"."settlement_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_user_id_collector_users_id_fk" FOREIGN KEY ("user_id_collector") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_debt_payment_id_debt_payments_id_fk" FOREIGN KEY ("debt_payment_id") REFERENCES "public"."debt_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_credit_charge_id_credit_charges_id_fk" FOREIGN KEY ("credit_charge_id") REFERENCES "public"."credit_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_credit_installment_id_credit_installments_id_fk" FOREIGN KEY ("credit_installment_id") REFERENCES "public"."credit_installments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_cycles" ADD CONSTRAINT "settlement_cycles_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_cycles" ADD CONSTRAINT "settlement_cycles_credit_account_id_credit_accounts_id_fk" FOREIGN KEY ("credit_account_id") REFERENCES "public"."credit_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_store_date" ON "audit_logs" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_inventory_product_date" ON "inventory_movements" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_store_active" ON "products" USING btree ("store_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_products_store_barcode" ON "products" USING btree ("store_id","barcode") WHERE "products"."barcode" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_products_store_low_stock" ON "products" USING btree ("store_id") WHERE "products"."is_service" = FALSE AND "products"."current_stock" <= "products"."minimum_stock";--> statement-breakpoint
CREATE INDEX "idx_purchase_items_purchase" ON "purchase_items" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_store_status" ON "purchase_orders" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_credit_accounts_store_status" ON "credit_accounts" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "idx_customers_store_active" ON "customers" USING btree ("store_id","is_active");--> statement-breakpoint
CREATE INDEX "idx_customers_user" ON "customers" USING btree ("user_id") WHERE "customers"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_subscription_payments_store" ON "subscription_payments" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_users_store_role" ON "users" USING btree ("store_id","role") WHERE "users"."is_active" = TRUE;--> statement-breakpoint
CREATE INDEX "idx_verifications_identifier" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "idx_sale_items_sale" ON "sale_items" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "idx_sales_store_date" ON "sales" USING btree ("store_id","sale_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_sales_customer" ON "sales" USING btree ("customer_id","sale_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_charge_voids_cycle" ON "credit_charge_voids" USING btree ("applied_cycle_id");--> statement-breakpoint
CREATE INDEX "idx_charges_account_date" ON "credit_charges" USING btree ("credit_account_id","purchase_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_charges_cycle" ON "credit_charges" USING btree ("settlement_cycle_id");--> statement-breakpoint
CREATE INDEX "idx_charges_pending_digest" ON "credit_charges" USING btree ("store_id","created_at") WHERE "credit_charges"."notified_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_charges_consent_pending" ON "credit_charges" USING btree ("consent_deadline") WHERE "credit_charges"."consent_status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_installments_account_due" ON "credit_installments" USING btree ("credit_account_id","due_date") WHERE "credit_installments"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "idx_allocations_payment" ON "payment_allocations" USING btree ("debt_payment_id");--> statement-breakpoint
CREATE INDEX "idx_settlement_account_cycle" ON "settlement_cycles" USING btree ("credit_account_id","cycle_number" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_settlement_store_status_due" ON "settlement_cycles" USING btree ("store_id","status","payment_due_date");--> statement-breakpoint
CREATE INDEX "idx_notifications_store_date" ON "notification_logs" USING btree ("store_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_notifications_customer_date" ON "notification_logs" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_daily_digest" ON "notification_logs" USING btree ("customer_id","digest_date") WHERE "notification_logs"."notification_type" = 'CHARGE_DIGEST';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_cycle_once" ON "notification_logs" USING btree ("notification_type","reference_id") WHERE "notification_logs"."notification_type" IN ('PAYMENT_REMINDER', 'CYCLE_STATEMENT', 'LATE_PAYMENT');