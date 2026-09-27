import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1790514243494 implements MigrationInterface {
  name = 'InitSchema1790514243494';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "steammy_bot"."catalog_epic" ("id" character varying(255) NOT NULL, "title" character varying(255) NOT NULL, "price" bigint, "size" bigint, "developer" character varying(255), "image" character varying(255), "description" text NOT NULL, "broadcasted" boolean NOT NULL DEFAULT false, "offer_start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "offer_end_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_66eb48295783389ff5a40b9017a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "steammy_bot"."catalog_xbox" ("id" character varying(255) NOT NULL, "title" character varying(255) NOT NULL, "price" bigint, "size" bigint, "developer" character varying(255), "image" character varying(255), "description" text NOT NULL, "broadcasted" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_d44f38b095c4070a9fedd4488a5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "steammy_bot"."subscription" ("id" character varying(255) NOT NULL, "platform" character varying(255) NOT NULL, "guild_id" character varying(255) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_bdc11f82583060bd5df70bcb5f4" PRIMARY KEY ("id", "platform", "guild_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "steammy_bot"."guild" ("id" character varying(255) NOT NULL, "prefix" character varying(255), "deleted" boolean NOT NULL DEFAULT false, "last_interact" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_cfbbd0a2805cab7053b516068a3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "steammy_bot"."subscription" ADD CONSTRAINT "FK_933df00dbde3b02c1f549ec4639" FOREIGN KEY ("guild_id") REFERENCES "steammy_bot"."guild"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "steammy_bot"."subscription" DROP CONSTRAINT "FK_933df00dbde3b02c1f549ec4639"`,
    );
    await queryRunner.query(`DROP TABLE "steammy_bot"."guild"`);
    await queryRunner.query(`DROP TABLE "steammy_bot"."subscription"`);
    await queryRunner.query(`DROP TABLE "steammy_bot"."catalog_xbox"`);
    await queryRunner.query(`DROP TABLE "steammy_bot"."catalog_epic"`);
  }
}
