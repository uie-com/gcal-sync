'use client'
import { redirect } from "next/navigation";

// Error boundaries must be Client Components

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    redirect('https://centercentre.com/');
}