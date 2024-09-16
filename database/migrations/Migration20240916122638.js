'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const { Migration } = require('@mikro-orm/migrations')

class Migration20240916122638 extends Migration {

	async up() {
		this.addSql('create table `epic_catalog` (`id` text not null, `created_at` datetime not null default CURRENT_TIMESTAMP, `updated_at` datetime not null default CURRENT_TIMESTAMP, `title` text not null, `price` integer null, `size` integer null, `developer` text null, `image` text null, `description` text not null, `broadcasted` integer not null default false, primary key (`id`));')
	}

}
exports.Migration20240916122638 = Migration20240916122638
