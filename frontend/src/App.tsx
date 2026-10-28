import { useState } from 'react'
import { Cursor } from './components/Cursor'
import { Nav } from './components/Nav'
import { Preloader } from './components/Preloader'
import { AITeacher } from './sections/AITeacher'
import { CTA } from './sections/CTA'
import { Classes } from './sections/Classes'
import { Footer } from './sections/Footer'
import { Hero } from './sections/Hero'
import { Library } from './sections/Library'
import { Marquee } from './sections/Marquee'
import { MissedClass } from './sections/MissedClass'
import { Poll } from './sections/Poll'
import { Quizzes } from './sections/Quizzes'
import { Sections } from './sections/Sections'
import { Weekly } from './sections/Weekly'
import { useLenis } from './hooks/useLenis'
import { useAnalytics } from './hooks/useAnalytics'
import { hasNavigated, useLinkRouting, usePage } from './lib/router'
import { VoiceProvider } from './lib/voice'
import { AdminRouter } from './pages/AdminRouter'
import { StudentActivate } from './pages/student/StudentActivate'
import { StudentProfile } from './pages/student/StudentProfile'

export default function App() {
  // Прокруткой после перехода заведует сам роутер: якорь на своей же странице
  // не должен даже доходить до React. И адрес тут не весь, а только группа:
  // полки библиотеки живут на главной, перерисовывать её ради них незачем.
  const page = usePage()
  useLinkRouting()
  useAnalytics()

  if (page === 'admin') return <AdminRouter />
  if (page === 'activate') return <StudentActivate />
  if (page === 'me') return <StudentProfile />
  return <PublicSite />
}

function PublicSite() {
  // Заставка — про загрузку сайта, а не про открытие страницы. Если читатель
  // пришёл сюда кликом из библиотеки, грузить уже нечего: полторы секунды
  // счётчика на пустом экране он прочитает как перезагрузку.
  const skipIntro = hasNavigated()
  const [ready, setReady] = useState(skipIntro)
  useLenis()

  return (
    <VoiceProvider>
      <div className="noise vignette relative min-h-screen">
        {!skipIntro && <Preloader onDone={() => setReady(true)} />}
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
          <Library />
          <Poll />
          <Classes />
          <CTA />
          <Footer />
        </main>
      </div>
    </VoiceProvider>
  )
}
