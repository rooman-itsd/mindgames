import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { needsOnboarding } from './types'
import { AppProvider, useApp } from './store/AppStore'
import { Toaster } from './components/ui/Toaster'
import { AppLayout } from './components/layout/AppLayout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { VerifyEmail } from './pages/VerifyEmail'
import { EventsLayout } from './pages/events/EventsLayout'
import { EventsUpcoming } from './pages/events/EventsUpcoming'
import { EventsMyRegistered } from './pages/events/EventsMyRegistered'
import { EventsPast } from './pages/events/EventsPast'
import { EventsHost } from './pages/events/EventsHost'
import { AcceptInvite } from './pages/AcceptInvite'
import { SetPassword } from './pages/SetPassword'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { NetworkLayout } from './pages/network/NetworkLayout'
import { NetworkMatches } from './pages/network/NetworkMatches'
import { NetworkRequests } from './pages/network/NetworkRequests'
import { NetworkMentors } from './pages/network/NetworkMentors'
import { NetworkMyNetwork } from './pages/network/NetworkMyNetwork'
import { Jobs } from './pages/Jobs'
import { Companies } from './pages/Companies'
import { CompanyPage } from './pages/CompanyPage'
import { CompanyRoadmaps } from './pages/CompanyRoadmaps'
import { Mentorship } from './pages/Mentorship'
import { StartupVarsity } from './pages/StartupVarsity'
import { News } from './pages/News'
import { ExploreCommunities } from './pages/ExploreCommunities'
import { CareerGuidance } from './pages/CareerGuidance'
import { CareerAssessmentPage } from './pages/CareerAssessmentPage'
import { EditRoadmapPage } from './pages/EditRoadmapPage'
import { ManageServicesPage } from './pages/ManageServicesPage'
import { CareerResourcesPage } from './pages/CareerResourcesPage'
import { CommunityPage } from './pages/CommunityPage'
import { Profile } from './pages/Profile'
import { Settings } from './pages/Settings'
import { Notifications } from './pages/Notifications'
import { AdminDashboard } from './pages/AdminDashboard'

// Gate for authenticated areas. Shows a spinner while the session hydrates,
// then redirects to /login if there's no valid session.
function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, loading } = useApp()
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-page">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Admin console gate: must be signed in as the admin account
// (network@rooman.com); everyone else lands back on their feed.
function RequireAdmin({ children }: { children: ReactNode }) {
  const { currentUser } = useApp()
  if (!currentUser.isAdmin) return <Navigate to="/home" replace />
  return <>{children}</>
}

// Members who never finished account setup are sent back to the onboarding
// wizard before they can use the app shell.
function RequireOnboarded({ children }: { children: ReactNode }) {
  const { currentUser } = useApp()
  if (needsOnboarding(currentUser)) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Public / full-screen (no app chrome) */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          {/* Post-invite: replace the generated password. Skippable. */}
          <Route path="/set-password" element={<RequireAuth><SetPassword /></RequireAuth>} />
          <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
          <Route
            path="/admin"
            element={
              <RequireAuth>
                <RequireAdmin>
                  <AdminDashboard />
                </RequireAdmin>
              </RequireAuth>
            }
          />

          {/* App shell (navbar + sidebars) — requires a session + finished setup */}
          <Route
            element={
              <RequireAuth>
                <RequireOnboarded>
                  <AppLayout />
                </RequireOnboarded>
              </RequireAuth>
            }
          >
            <Route path="/home" element={<Home />} />
            <Route path="/network" element={<NetworkLayout />}>
              <Route index element={<Navigate to="matches" replace />} />
              <Route path="matches" element={<NetworkMatches />} />
              <Route path="requests" element={<NetworkRequests />} />
              <Route path="mentors" element={<NetworkMentors />} />
              <Route path="my-network" element={<NetworkMyNetwork />} />
            </Route>
            <Route path="/events" element={<EventsLayout />}>
              <Route index element={<Navigate to="upcoming" replace />} />
              <Route path="upcoming" element={<EventsUpcoming />} />
              <Route path="my-events" element={<EventsMyRegistered />} />
              <Route path="past" element={<EventsPast />} />
              <Route path="host" element={<EventsHost />} />
            </Route>
            <Route path="/jobs" element={<Jobs />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/companies/:id" element={<CompanyPage />} />
            <Route path="/companies/:id/roadmaps" element={<CompanyRoadmaps />} />
            <Route path="/mentorship" element={<Mentorship />} />
            <Route path="/startupvarsity" element={<StartupVarsity />} />
            <Route path="/news" element={<News />} />
            <Route path="/explore" element={<ExploreCommunities />} />
            <Route path="/career-guidance" element={<CareerGuidance />} />
            {/* The edit flows are their own screens, not panels stacked on the
                roadmap page — each gets its own history entry so Back works. */}
            <Route path="/career-guidance/assessment" element={<CareerAssessmentPage />} />
            <Route path="/career-guidance/roadmap/edit" element={<EditRoadmapPage />} />
            <Route path="/career-guidance/services" element={<ManageServicesPage />} />
            <Route path="/learning-resources" element={<CareerResourcesPage />} />
            <Route path="/community/:id" element={<CommunityPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:id" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/notifications" element={<Notifications />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </AppProvider>
  )
}
