import { EmbedBuilder } from 'discord.js'
import { filesize } from 'filesize'

import { Service } from '@/decorators'

const MAX_LENGTH = 300

@Service()
export class GameEmbed {

	// TODO: Define type of games
	build(game: any) {
		const builder = new EmbedBuilder()
		const fields = []
		const { title, developer, description, price, size, image } = game

		builder.setTitle(title)
		builder.setDescription(this.truncate(description))
		if (image) builder.setImage(image)

		if (price) fields.push({ name: 'Price', value: `$${price / 100}` })
		if (size) fields.push({ name: 'Size', value: filesize(size) })
		if (developer) fields.push({ name: 'Developer', value: developer })
		builder.addFields(fields)

		return builder
	}

	private truncate(text: string) {
		if (text.length > MAX_LENGTH) {
			return `${text.slice(0, MAX_LENGTH)}...`
		}

		return text
	}

}