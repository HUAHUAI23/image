import { z } from 'zod'

export const DEFAULT_TASK_TYPE = 'image_to_image' as const
export const DEFAULT_IMAGE_NUMBER = 4
export const DEFAULT_TEMPLATE_ID = 'none'

export const taskTypeEnum = z.enum(['text_to_image', 'image_to_image'])

const imageUrlField = z.union([z.literal(''), z.string().url('图片地址格式不正确')])

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
    imageNumber: z.coerce.number().int().min(1, '图片数量至少为 1').max(20, '图片数量不能超过 20'),
    existingImageUrl: imageUrlField.optional().transform((value) => value ?? ''),
    hasLocalImage: z.boolean().default(false),
  })
  .refine((data) => data.type !== 'text_to_image' || data.userPrompt.length > 0, {
    message: '文生图必须提供提示词',
    path: ['userPrompt'],
  })
  .refine(
    (data) =>
      data.type !== 'image_to_image' || data.existingImageUrl.length > 0 || data.hasLocalImage,
    {
      message: '图生图必须上传原始图片',
      path: ['existingImageUrl'],
    }
  )

export type CreateTaskFormValues = z.infer<typeof createTaskFormSchema>

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
    imageNumber: z.number().int().min(1, '图片数量至少为 1').max(20, '图片数量不能超过 20'),
    existingImageUrl: z.url('图片地址格式不正确').nullable(),
  })
  .refine((data) => data.type !== 'text_to_image' || data.userPrompt.length > 0, {
    message: '文生图必须提供提示词',
    path: ['userPrompt'],
  })

export type CreateTaskPayload = z.infer<typeof createTaskPayloadSchema>
