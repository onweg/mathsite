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
import { Sections } from './sections/Sections'
import { Weekly } from './sections/Weekly'
import { useLenis } from './hooks/useLenis'

export default function App() {
  const [ready, setReady] = useState(false)
  useLenis()

  return (
    <div className="noise vignette relative min-h-screen">
      <Preloader onDone={() => setReady(true)} />
      <Cursor />
      <Nav />

      <main className={`transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
        <Hero />
        <Marquee />
        <Sections />
        <AITeacher />
        <MissedClass />
        <Weekly />
        <Classes />
        <CTA />
        <Footer />
      </main>
    </div>
  )
}
