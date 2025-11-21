import { eq } from 'drizzle-orm'

import { db } from '../db'
import { prices } from '../db/schema'

/**
 * Initialize price configuration
 * Sets per_image pricing for both text_to_image and image_to_image tasks
 * pnpm tsx --env-file=.env scripts/init-prices.ts
 */
async function initPrices() {
  console.log('Initializing price configuration...')

  try {
    // Price in cents (20 cents = 0.2 yuan)
    const pricePerImage = 20

    // Text to image pricing
    const textToImageExists = await db.query.prices.findFirst({
      where: eq(prices.taskType, 'text_to_image'),
    })

    if (!textToImageExists) {
      await db.insert(prices).values({
        taskType: 'text_to_image',
        price: pricePerImage,
        priceUnit: 'per_image',
      })
      console.log(`✓ Created text_to_image pricing: ${pricePerImage} cents per image`)
    } else {
      console.log(
        `✓ text_to_image pricing already exists: ${textToImageExists.price} cents per image`
      )
    }

    // Image to image pricing
    const imageToImageExists = await db.query.prices.findFirst({
      where: eq(prices.taskType, 'image_to_image'),
    })

    if (!imageToImageExists) {
      await db.insert(prices).values({
        taskType: 'image_to_image',
        price: pricePerImage,
        priceUnit: 'per_image',
      })
      console.log(`✓ Created image_to_image pricing: ${pricePerImage} cents per image`)
    } else {
      console.log(
        `✓ image_to_image pricing already exists: ${imageToImageExists.price} cents per image`
      )
    }

    console.log('\n✓ Price initialization completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('Error initializing prices:', error)
    process.exit(1)
  }
}

initPrices()
