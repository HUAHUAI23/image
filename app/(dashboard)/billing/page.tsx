import { getBalanceAction, getTransactionsAction } from '@/app/actions/billing'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function BillingPage() {
  const balance = await getBalanceAction()
  const transactions = await getTransactionsAction()

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>账户余额</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">¥ {balance}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>交易记录</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>金额</TableHead>
                <TableHead>任务ID</TableHead>
                <TableHead>时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{tx.id}</TableCell>
                  <TableCell>{tx.type === 'charge' ? '扣费' : '退款'}</TableCell>
                  <TableCell className={tx.type === 'charge' ? 'text-red-500' : 'text-green-500'}>
                    {tx.type === 'charge' ? '-' : '+'}{tx.amount}
                  </TableCell>
                  <TableCell>{tx.taskId}</TableCell>
                  <TableCell>{new Date(tx.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}