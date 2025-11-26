import { z } from 'zod'

export const DEFAULT_TASK_TYPE = 'image_to_image' as const
export const DEFAULT_IMAGE_NUMBER = 4
export const DEFAULT_TEMPLATE_ID = 'none'
export const DEFAULT_SIZE = '2K' as const
export const DEFAULT_SEQUENTIAL_MODE = 'disabled' as const

// ==================== 生成选项验证 ====================

/**
 * 图片尺寸验证
 * 支持：预设值（1K, 2K, 4K）或具体像素值（如 2048x2048）
 */
const sizeSchema = z
  .string()
  .refine(
    (value) => {
      // 预设值
      if (['1K', '2K', '4K'].includes(value)) return true
      // 具体像素值格式：宽x高
      const match = value.match(/^(\d+)x(\d+)$/)
      if (!match) return false
      const width = parseInt(match[1])
      const height = parseInt(match[2])
      // 宽高范围验证
      return width >= 1280 && width <= 4096 && height >= 720 && height <= 4096
    },
    {
      message: '尺寸格式不正确，应为 1K/2K/4K 或 宽x高 (如 2048x2048)',
    }
  )
  .optional()
  .default(DEFAULT_SIZE)

/**
 * 组图模式验证
 */
const sequentialImageGenerationSchema = z
  .enum(['auto', 'disabled'])
  .optional()
  .default(DEFAULT_SEQUENTIAL_MODE)

/**
 * 组图选项验证
 */
const sequentialImageGenerationOptionsSchema = z
  .object({
    maxImages: z
      .number()
      .int()
      .min(1, '组图最大数量至少为 1')
      .max(15, '组图最大数量不能超过 15')
      .optional(),
  })
  .optional()

/**
 * 提示词优化选项验证
 */
const optimizePromptOptionsSchema = z
  .object({
    mode: z.enum(['standard', 'fast']).optional().default('standard'),
  })
  .optional()

/**
 * 生成选项整体验证
 */
export const generationOptionsSchema = z.object({
  size: sizeSchema,
  sequentialImageGeneration: sequentialImageGenerationSchema,
  sequentialImageGenerationOptions: sequentialImageGenerationOptionsSchema,
  optimizePromptOptions: optimizePromptOptionsSchema,
  watermark: z.boolean().optional().default(false),
})

export type GenerationOptions = z.infer<typeof generationOptionsSchema>

// ==================== 任务类型验证 ====================

export const taskTypeEnum = z.enum(['text_to_image', 'image_to_image'])

const imageUrlField = z.union([z.literal(''), z.string().url('图片地址格式不正确')])

// ==================== 前端表单验证 ====================

export const createTaskFormSchema = z
  .object({
    type: taskTypeEnum.default(DEFAULT_TASK_TYPE),
    name: z.string().trim().min(1, '任务名称不能为空').max(255, '任务名称过长'),
    userPrompt: z
      .string()
      .trim()
      .max(20000, '提示词长度不能超过 20000 个字符')
      .optional()
      .transform((value) => value ?? ''),
    templateId: z
      .string()
      .default(DEFAULT_TEMPLATE_ID)
      .refine((value) => value === DEFAULT_TEMPLATE_ID || /^\d+$/.test(value), {
        message: '风格模板格式错误',
      }),
    imageNumber: z.coerce
      .number()
      .int()
      .min(1, '图片数量至少为 1')
      .max(500, '图片数量不能超过 500'),
    // 支持多图输入：单张图片或逗号分隔的多张图片 URL
    existingImageUrls: z
      .string()
      .optional()
      .transform((value) => value ?? ''),
    hasLocalImage: z.boolean().default(false),
    // 生成选项
    generationOptions: generationOptionsSchema.optional(),
  })
  .refine((data) => data.type !== 'text_to_image' || data.userPrompt.length > 0, {
    message: '文生图必须提供提示词',
    path: ['userPrompt'],
  })
  .refine(
    (data) =>
      data.type !== 'image_to_image' || data.existingImageUrls.length > 0 || data.hasLocalImage,
    {
      message: '图生图必须上传原始图片',
      path: ['existingImageUrls'],
    }
  )

export type CreateTaskFormValues = z.infer<typeof createTaskFormSchema>

// ==================== 后端 API 验证 ====================

export const createTaskPayloadSchema = z
  .object({
    type: taskTypeEnum,
    name: z.string().trim().min(1, '任务名称不能为空').max(255, '任务名称过长'),
    userPrompt: z
      .string()
      .trim()
      .max(20000, '提示词长度不能超过 20000 个字符')
      .optional()
      .transform((value) => value ?? ''),
    templatePromptId: z.number().int().positive().nullable(),
    imageNumber: z.number().int().min(1, '图片数量至少为 1').max(500, '图片数量不能超过 500'),
    // 支持多图输入：数组形式
    originalImageUrls: z.array(z.string().url('图片地址格式不正确')).default([]),
    generationOptions: generationOptionsSchema.optional(),
  })
  .refine((data) => data.type !== 'text_to_image' || data.userPrompt.length > 0, {
    message: '文生图必须提供提示词',
    path: ['userPrompt'],
  })
  .refine((data) => data.type !== 'image_to_image' || data.originalImageUrls.length > 0, {
    message: '图生图必须提供原始图片',
    path: ['originalImageUrls'],
  })

export type CreateTaskPayload = z.infer<typeof createTaskPayloadSchema>

// ==================== 辅助函数 ====================

/**
 * 计算预期生成的图片数量
 * @param imageNumber 用户指定的批次数量
 * @param generationOptions 生成选项
 * @returns 预期生成的总图片数量（用于预付费）
 */
export function calculateExpectedImageCount(
  imageNumber: number,
  generationOptions?: GenerationOptions
): number {
  const seqMode = generationOptions?.sequentialImageGeneration
  const maxImages = generationOptions?.sequentialImageGenerationOptions?.maxImages

  if (seqMode === 'auto') {
    // 组图模式：每批可能生成 1-maxImages 张
    // 预付费按最大值计算
    const perBatchMax = maxImages || 15 // 默认最大 15 张
    return imageNumber * perBatchMax
  } else {
    // 单图模式：每批生成 1 张
    return imageNumber
  }
}
