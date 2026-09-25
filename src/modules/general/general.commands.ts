import { Injectable } from '@nestjs/common'
import { Client, EmbedBuilder } from 'discord.js'
import { Context, SlashCommand, SlashCommandContext } from 'necord'

@Injectable()
export class GeneralCommands {

	constructor(private readonly client: Client) {}

	@SlashCommand({
		name: 'ping',
		description: 'Check the bot latency',
	})
	async onPing(@Context() [interaction]: SlashCommandContext) {
		const ping = Math.round(this.client.ws.ping)
		const sentTime = interaction.createdTimestamp
		const diff = Date.now() - sentTime

		return interaction.reply({
			content: `🏓 Pong! Roundtrip: **${diff}ms** | WebSocket Heartbeat: **${ping}ms**`,
			ephemeral: true,
		})
	}

	@SlashCommand({
		name: 'invite',
		description: 'Get the invite link for Steammy bot',
	})
	async onInvite(@Context() [interaction]: SlashCommandContext) {
		const clientId = this.client.user?.id || '1284565018788106273'
		const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=2147485696&scope=bot%20applications.commands`

		const embed = new EmbedBuilder()
			.setTitle('Invite Steammy')
			.setDescription(`Click [here](${inviteUrl}) to add Steammy to your server!`)
			.setColor(0x00A8FF)

		return interaction.reply({
			embeds: [embed],
			ephemeral: true,
		})
	}

	@SlashCommand({
		name: 'help',
		description: 'Show how to use Steammy and list all commands',
	})
	async onHelp(@Context() [interaction]: SlashCommandContext) {
		const embed = new EmbedBuilder()
			.setTitle('Steammy Bot - Help')
			.setDescription('Steammy keeps track of your game platforms\' free offers and announcements.')
			.addFields([
				{
					name: '🎮 Gaming Commands',
					value: '`/subscribe <platform>` - Subscribe this channel to game announcements\n`/unsubscribe <platform>` - Unsubscribe this channel from announcements',
				},
				{
					name: '⚙️ Admin Commands',
					value: '`/sync <platform>` - Manually update the game catalog (Admin only)\n`/broadcast <platform>` - Manually trigger an announcement broadcast (Admin only)',
				},
				{
					name: 'ℹ️ General Commands',
					value: '`/ping` - Check bot latency\n`/invite` - Get the bot invite link\n`/help` - Show this help menu',
				},
			])
			.setColor(0x00A8FF)

		return interaction.reply({
			embeds: [embed],
			ephemeral: true,
		})
	}

}
