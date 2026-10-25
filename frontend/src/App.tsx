import { useEffect, useRef, useState } from 'react'
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
import { Poll } from './sections/Poll'
import { Quizzes } from './sections/Quizzes'
import { Sections } from './sections/Sections'
import { Weekly } from './sections/Weekly'
import {
  scrollToIdWhenReady,
  scrollToTop,
  scrollWindowTo,
  useLenis,
} from './hooks/useLenis'
import {
  consumeSavedScroll,
  hasNavigated,
  useLinkRouting,
  useRoute,
} from './lib/router'
import { VoiceProvider } from './lib/voice'
import { AdminRouter } from './pages/AdminRouter'
import { LibraryApp } from './pages/library/LibraryApp'
import { StudentActivate } from './pages/student/StudentActivate'
import { StudentProfile } from './pages/student/StudentProfile'

export default function App() {
  const route = useRoute()
  useLinkRouting()

  // Переход внутри сайта должен вести себя как обычная навигация: «назад» —
  // вернуть на прежнее место, якорь — подвести к секции, остальное — начало
  // новой страницы. Первый рендер пропускаем: там прокруткой распоряжается
  // браузер, и после обновления страницы он честно возвращает читателя туда,
  // где тот был.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const saved = consumeSavedScroll()
    if (saved !== null) scrollWindowTo(saved)
    else if (route.hash) scrollToIdWhenReady(route.hash.slice(1))
    else scrollToTop()
  }, [route.path, route.hash])

  const path = route.path
  if (path.startsWith('/admin')) return <AdminRouter />
  if (path === '/library' || path.startsWith('/library/')) return <LibraryApp />
  if (path.startsWith('/s/')) return <StudentActivate />
  if (path === '/me' || path.startsWith('/me/')) return <StudentProfile />
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
          <Poll />
          <Classes />
          <CTA />
          <Footer />
        </main>
      </div>
    </VoiceProvider>
  )
}
