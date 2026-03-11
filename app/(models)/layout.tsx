import { redirect } from 'next/navigation'

export default async function ModelsLayout({ children }: { children: React.ReactNode }) {
  redirect('/?denied=models')
}
