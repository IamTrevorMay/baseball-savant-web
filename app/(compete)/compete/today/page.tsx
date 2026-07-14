import { redirect } from 'next/navigation'

// The Today view was rolled into the Dashboard as the "Today's Schedule"
// section. Keep the URL working by redirecting to the dashboard.
export default function TodayRedirect() {
  redirect('/compete')
}
