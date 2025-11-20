import { getPromptTemplatesAction } from '@/app/actions/template'
import CreateTaskForm from './form'

export default async function CreateTaskPage() {
  const templates = await getPromptTemplatesAction()
  return <CreateTaskForm templates={templates} />
}
