'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const { Migration } = require('@mikro-orm/migrations')

class Migration20240915101305 extends Migration {

	async up() {
		this.addSql('create table `data` (`key` text not null, `created_at` datetime not null, `updated_at` datetime not null, `value` text not null default \'\', primary key (`key`));')

		this.addSql('create table `guild` (`id` text not null, `created_at` datetime not null, `updated_at` datetime not null, `prefix` text null, `deleted` integer not null default false, `last_interact` datetime not null, primary key (`id`));')

		this.addSql('create table `image` (`id` integer not null primary key autoincrement, `created_at` datetime not null, `updated_at` datetime not null, `file_name` text not null, `base_path` text not null default \'\', `url` text not null, `size` integer not null, `tags` text not null, `hash` text not null, `delete_hash` text not null);')

		this.addSql('create table `pastebin` (`id` text not null, `edit_code` text not null, `lifetime` integer not null default -1, `created_at` datetime not null, primary key (`id`));')

		this.addSql('create table `stat` (`id` integer not null primary key autoincrement, `type` text not null, `value` text not null default \'\', `additional_data` json null, `created_at` datetime not null);')

		this.addSql('create table `subscription` (`id` text not null, `platform` text not null, `guild_id` text not null, `created_at` datetime not null, `updated_at` datetime not null, constraint `subscription_guild_id_foreign` foreign key(`guild_id`) references `guild`(`id`) on update cascade, primary key (`id`, `platform`, `guild_id`));')
		this.addSql('create index `subscription_guild_id_index` on `subscription` (`guild_id`);')

		this.addSql('create table `user` (`id` text not null, `created_at` datetime not null, `updated_at` datetime not null, `last_interact` datetime not null, primary key (`id`));')
	}

}
exports.Migration20240915101305 = Migration20240915101305
