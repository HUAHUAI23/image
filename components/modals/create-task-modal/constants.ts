/**
 * Create Task Modal - Constants
 *
 * 创建任务模态框的常量配置文件
 * 包含图片上传、文件类型、超时等配置
 */

// ==================== 图片上传限制 ====================

/**
 * 最大图片数量限制
 * 多图模式下最多可以上传的图片数量
 */
export const MAX_IMAGES = 10

/**
 * 允许上传的图片类型
 * 符合 HTML input accept 属性规范
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/file#accept
 */
export const IMAGE_ACCEPT_TYPES = 'image/*'

/**
 * 支持的具体图片格式列表（用于展示）
 */
export const SUPPORTED_IMAGE_FORMATS = ['JPG', 'PNG', 'WEBP'] as const

// ==================== VLM分析配置 ====================

/**
 * VLM图片分析超时时间（毫秒）
 * 超过此时间将视为分析失败
 */
export const VLM_ANALYSIS_TIMEOUT = 30000 // 30秒

// ==================== UI配置 ====================

/**
 * 图片预览尺寸类别
 */
export const IMAGE_SIZE_OPTIONS = [
  { value: '1K', label: '1K', desc: '智能尺寸' },
  { value: '2K', label: '2K', desc: '智能尺寸' },
  { value: '4K', label: '4K', desc: '智能尺寸' },
  { value: '2048x2048', label: '1:1', desc: '2048×2048' },
  { value: '2560x1440', label: '16:9', desc: '2560×1440' },
  { value: '1440x2560', label: '9:16', desc: '1440×2560' },
  { value: '2304x1728', label: '4:3', desc: '2304×1728' },
  { value: '1728x2304', label: '3:4', desc: '1728×2304' },
] as const

/**
 * 快捷数量选择按钮
 */
export const QUICK_COUNT_OPTIONS = [1, 4, 8] as const

/**
 * 组图模式最大数量选项
 */
export const SEQUENTIAL_MAX_OPTIONS = [3, 5, 8, 10, 12, 15] as const
