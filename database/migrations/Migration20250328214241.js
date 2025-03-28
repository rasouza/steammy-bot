'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const { Migration } = require('@mikro-orm/migrations');

class Migration20250328214241 extends Migration {

  async up() {
    this.addSql(`create table "steammy_bot"."catalog_epic" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "title" varchar(255) not null, "price" int8 null, "size" int8 null, "developer" varchar(255) null, "image" varchar(255) null, "description" text not null, "broadcasted" boolean not null default false, "offer_start_at" timestamptz not null, "offer_end_at" timestamptz not null, constraint "catalog_epic_pkey" primary key ("id"));`);

    this.addSql(`create table "steammy_bot"."catalog_xbox" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "title" varchar(255) not null, "price" int8 null, "size" int8 null, "developer" varchar(255) null, "image" varchar(255) null, "description" text not null, "broadcasted" boolean not null default false, constraint "catalog_xbox_pkey" primary key ("id"));`);

    this.addSql(`drop table if exists "steammy_bot"."game_catalog" cascade;`);
  }

  async down() {
    this.addSql(`create table "steammy_bot"."game_catalog" ("id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "title" varchar(255) not null, "price" int8 null, "size" int8 null, "developer" varchar(255) null, "image" varchar(255) null, "description" text not null, "broadcasted" boolean not null default false, "platform" varchar(255) not null, constraint "game_catalog_pkey" primary key ("id"));`);

    this.addSql(`drop table if exists "steammy_bot"."catalog_epic" cascade;`);

    this.addSql(`drop table if exists "steammy_bot"."catalog_xbox" cascade;`);
  }

}
exports.Migration20250328214241 = Migration20250328214241;
