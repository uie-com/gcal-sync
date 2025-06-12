"use client";

import { useEffect } from "react";

export default function Home() {

  useEffect(() => {
    fetch('/sync', { method: 'POST', });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <h1 className="text-4xl font-bold mb-4">Sync in Progress</h1>
      <p className="text-lg text-gray-600">You can now close this tab.</p>
    </div>
  )
}
