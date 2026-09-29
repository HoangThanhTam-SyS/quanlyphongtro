import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type EmptyPageProps = {
  title: string
  description: string
}

export function EmptyPage({ title, description }: EmptyPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Chưa có dữ liệu</CardTitle>
          <CardDescription>
            Trang này đã sẵn sàng. Dữ liệu sẽ được nối với Supabase ở bước tiếp
            theo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Chưa có bản ghi nào để hiển thị.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
