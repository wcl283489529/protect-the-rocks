import React from 'react';
import GoldfishPond from './components/FluidSimulation';
import { Github, Info, ShieldAlert } from 'lucide-react';

const App: React.FC = () => {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#001e2b] text-white font-sans">
      {/* Game Canvas */}
      <GoldfishPond />

      {/* Overlay UI */}
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
        
        {/* Header */}
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-serif tracking-wide text-amber-100 drop-shadow-md">
              Neon Defense
            </h1>
            <p className="text-teal-200/80 text-sm mt-1 font-light max-w-md">
              The jellyfish are attacking the reef! Hold mouse to gather energy, release to shoot particles. 
              <span className="text-amber-300 font-bold"> Aim for their heads!</span>
            </p>
          </div>
        </header>

        {/* Center Action Prompt */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center opacity-60 pointer-events-none">
          <div className="flex flex-col items-center gap-3 animate-pulse">
            <ShieldAlert className="w-10 h-10 text-red-300/80" />
            <span className="text-lg font-light tracking-widest text-red-100/80 uppercase">
              Protect the Rocks
            </span>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex justify-between items-end opacity-80">
          <div className="flex flex-col gap-2">
             <div className="flex items-center gap-2 text-xs text-teal-100/50">
               <Info className="w-3 h-3" />
               <span>Win: Kill all Jellyfish | Lose: Rocks destroyed</span>
             </div>
          </div>

          <div className="pointer-events-auto">
            <button className="group flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 rounded-full transition-all duration-300">
              <Github className="w-4 h-4 text-teal-100/70 group-hover:text-teal-100" />
              <span className="text-sm font-medium text-teal-100/70 group-hover:text-teal-100">View Source</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;