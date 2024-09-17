'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const { Migration } = require('@mikro-orm/migrations');

class Migration20240917204830 extends Migration {

  async up() {
    this.addSql('create table "data" ("key" varchar(255) not null, "created_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "updated_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "value" varchar(255) not null default \'\', constraint "data_pkey" primary key ("key"));');

    this.addSql('create table "game_catalog" ("id" varchar(255) not null, "created_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "updated_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "title" varchar(255) not null, "price" int8 null, "size" int8 null, "developer" varchar(255) null, "image" varchar(255) null, "description" text not null, "broadcasted" boolean not null default false, "platform" varchar(255) not null, constraint "game_catalog_pkey" primary key ("id"));');

    this.addSql('create table "guild" ("id" varchar(255) not null, "created_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "updated_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "prefix" varchar(255) null, "deleted" boolean not null default false, "last_interact" timestamptz(0) not null, constraint "guild_pkey" primary key ("id"));');

    this.addSql('create table "image" ("id" serial primary key, "created_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "updated_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "file_name" varchar(255) not null, "base_path" varchar(255) not null default \'\', "url" varchar(255) not null, "size" int not null, "tags" text[] not null, "hash" varchar(255) not null, "delete_hash" varchar(255) not null);');

    this.addSql('create table "pastebin" ("id" varchar(255) not null, "edit_code" varchar(255) not null, "lifetime" int not null default -1, "created_at" timestamptz(0) not null, constraint "pastebin_pkey" primary key ("id"));');

    this.addSql('create table "stat" ("id" serial primary key, "type" varchar(255) not null, "value" varchar(255) not null default \'\', "additional_data" jsonb null, "created_at" timestamptz(0) not null);');

    this.addSql('create table "subscription" ("id" varchar(255) not null, "platform" varchar(255) not null, "guild_id" varchar(255) not null, "created_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "updated_at" timestamptz(0) not null default CURRENT_TIMESTAMP, constraint "subscription_pkey" primary key ("id", "platform", "guild_id"));');

    this.addSql('create table "user" ("id" varchar(255) not null, "created_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "updated_at" timestamptz(0) not null default CURRENT_TIMESTAMP, "last_interact" timestamptz(0) not null, constraint "user_pkey" primary key ("id"));');

    this.addSql('alter table "subscription" add constraint "subscription_guild_id_foreign" foreign key ("guild_id") references "guild" ("id") on update cascade;');
  }

}
exports.Migration20240917204830 = Migration20240917204830;
