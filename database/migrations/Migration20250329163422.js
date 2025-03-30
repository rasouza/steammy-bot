'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const { Migration } = require('@mikro-orm/migrations')

class Migration20250329163422 extends Migration {

	async up() {
		this.addSql(`create schema if not exists "steammy_bot";`)
		this.addSql(`create table "steammy_bot"."catalog_epic" ("id" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "title" varchar(255) not null, "price" int8 null, "size" int8 null, "developer" varchar(255) null, "image" varchar(255) null, "description" text not null, "broadcasted" boolean not null default false, "offer_start_at" timestamptz not null, "offer_end_at" timestamptz not null, constraint "catalog_epic_pkey" primary key ("id"));`)

		this.addSql(`create table "steammy_bot"."catalog_xbox" ("id" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "title" varchar(255) not null, "price" int8 null, "size" int8 null, "developer" varchar(255) null, "image" varchar(255) null, "description" text not null, "broadcasted" boolean not null default false, constraint "catalog_xbox_pkey" primary key ("id"));`)

		this.addSql(`create table "steammy_bot"."data" ("key" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "value" varchar(255) not null default '', constraint "data_pkey" primary key ("key"));`)

		this.addSql(`create table "steammy_bot"."guild" ("id" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "prefix" varchar(255) null, "deleted" boolean not null default false, "last_interact" timestamptz not null, constraint "guild_pkey" primary key ("id"));`)

		this.addSql(`create table "steammy_bot"."image" ("id" serial primary key, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "file_name" varchar(255) not null, "base_path" varchar(255) not null default '', "url" varchar(255) not null, "size" int not null, "tags" text[] not null, "hash" varchar(255) not null, "delete_hash" varchar(255) not null);`)

		this.addSql(`create table "steammy_bot"."pastebin" ("id" varchar(255) not null, "edit_code" varchar(255) not null, "lifetime" int not null default -1, "created_at" timestamptz not null, constraint "pastebin_pkey" primary key ("id"));`)

		this.addSql(`create table "steammy_bot"."stat" ("id" serial primary key, "type" varchar(255) not null, "value" varchar(255) not null default '', "additional_data" jsonb null, "created_at" timestamptz not null);`)

		this.addSql(`create table "steammy_bot"."subscription" ("id" varchar(255) not null, "platform" varchar(255) not null, "guild_id" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, constraint "subscription_pkey" primary key ("id", "platform", "guild_id"));`)

		this.addSql(`create table "steammy_bot"."user" ("id" varchar(255) not null, "created_at" timestamptz not null default CURRENT_TIMESTAMP, "updated_at" timestamptz not null default CURRENT_TIMESTAMP, "last_interact" timestamptz not null, constraint "user_pkey" primary key ("id"));`)

		this.addSql(`alter table "steammy_bot"."subscription" add constraint "subscription_guild_id_foreign" foreign key ("guild_id") references "steammy_bot"."guild" ("id") on update cascade;`)
	}

	async down() {
		this.addSql(`alter table "steammy_bot"."subscription" drop constraint "subscription_guild_id_foreign";`)

		this.addSql(`drop table if exists "steammy_bot"."catalog_epic" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."catalog_xbox" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."data" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."guild" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."image" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."pastebin" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."stat" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."subscription" cascade;`)

		this.addSql(`drop table if exists "steammy_bot"."user" cascade;`)

		this.addSql(`drop schema if exists "steammy_bot";`)
	}

}
exports.Migration20250329163422 = Migration20250329163422
