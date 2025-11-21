import { db } from '../db'
import { promptTemplates } from '../db/schema'

/**
 * Seed prompt templates into the database
 *
 * Usage: pnpm tsx --env-file=.env scripts/seed-templates.ts
 */

const templates = [
  {
    name: '工具',
    category: '工具',
    content:
      '基于以下描述生成专业的工具风格图片：{{ prompt }}，保持文字不变即排版不变，背景用纯色，图片内容随机换掉。',
  },
  {
    name: '金融',
    category: '金融',
    content:
      '基于以下描述生成专业的金融风格图片：{{ prompt }}，保持文字不变，图片内容随机换掉，和原图的相似度要低于40%',
  },
  {
    name: '小说',
    category: '小说',
    content:
      '基于以下描述生成富有故事性的图片：{{ prompt }}，营造戏剧性和情感氛围，保持文字和logo不变，其他的随机改变',
  },
  {
    name: '短剧',
    category: '短剧',
    content:
      '基于以下描述生成富有故事性的图片：{{ prompt }}，营造戏剧性和情感氛围，保持文字和logo不变，其他的随机改变',
  },
  {
    name: '社交',
    category: '社交',
    content:
      '基于以下描述生成社交友好的图片：{{ prompt }}，人物随机变化，场景随机变化，保持文字和logo不变,场景要接地气，不要有AI感，面向三四线城市男性，色彩不能用红色和粉色',
  },
  {
    name: '快应用',
    category: '快应用',
    content:
      '基于以下描述生成轻量级应用风格的图片：{{ prompt }}，简洁明快，适合小程序和快应用界面。',
  },
]

async function seedTemplates() {
  try {
    console.log('Starting to seed prompt templates...')

    // Insert all templates
    const result = await db.insert(promptTemplates).values(templates).returning()

    console.log(`✓ Successfully inserted ${result.length} prompt templates:`)
    result.forEach((template) => {
      console.log(`  - ID ${template.id}: ${template.name} (${template.category})`)
    })

    process.exit(0)
  } catch (error) {
    console.error('Error seeding templates:', error)
    process.exit(1)
  }
}

seedTemplates()
