import { useState } from 'react'
import { Cursor } from './components/Cursor'
import { Nav } from './components/Nav'
import { Preloader } from './components/Preloader'
import { AITeacher } from './sections/AITeacher'
import { CTA } from './sections/CTA'
import { Classes } from './sections/Classes'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { Marquee } from './sections/Marquee'
import { MissedClass } from './sections/MissedClass'
import { Quizzes } from './sections/Quizzes'
import { Sections } from './sections/Sections'
import { Weekly } from './sections/Weekly'
import { useLenis } from './hooks/useLenis'
import { VoiceProvider } from './lib/voice'
import { AdminRouter } from './pages/AdminRouter'
import { StudentActivate } from './pages/student/StudentActivate'
import { StudentProfile } from './pages/student/StudentProfile'

export default function App() {
  const path = typeof window !== 'undefined' ? window.location.pathname : ''
  if (path.startsWith('/admin')) return <AdminRouter />
  if (path.startsWith('/s/')) return <StudentActivate />
  if (path === '/me' || path.startsWith('/me/')) return <StudentProfile />
  return <PublicSite />
}

function PublicSite() {
  const [ready, setReady] = useState(false)
  useLenis()

  return (
    <VoiceProvider>
      <div className="noise vignette relative min-h-screen">
        <Preloader onDone={() => setReady(true)} />
        <Cursor />
        <Nav />

        <main
          className={`transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}
        >
          <Hero />
          <Marquee />
          <Sections />
          <AITeacher />
          <MissedClass />
          <Weekly />
          <Quizzes />
          <Classes />
          <CTA />
          <Footer />
        </main>
      </div>
    </VoiceProvider>
  )
}
