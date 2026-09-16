'use client'

import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { useStore } from '@/lib/hooks/useData'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Sparkles, Brain, User, ArrowLeft, Trash2, TrendingUp, Wallet, Package, Target } from 'lucide-react'
import Link from 'next/link'

export default function ToulAIPage() {
    const { data: store } = useStore()
    const storeId = store?.id

    if (!storeId) return (
        <div className="h-screen flex items-center justify-center" style={{ background: 'var(--toul-bg)' }}>
            <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: 'var(--toul-accent)', borderTopColor: 'transparent' }} />
        </div>
    )

    return <ChatInterface key={storeId} storeId={storeId} storeName={store?.name || ''} />
}

// ── Markdown-like renderer ──────────────────────────────────────────────────
function renderMarkdown(text: string) {
    if (!text) return null

    const lines = text.split('\n')
    const elements: React.ReactNode[] = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Headers
        if (line.startsWith('### ')) {
            elements.push(<h4 key={i} className="font-bold text-[13px] mt-3 mb-1" style={{ color: 'var(--toul-text)' }}>{formatInline(line.slice(4))}</h4>)
            continue
        }
        if (line.startsWith('## ')) {
            elements.push(<h3 key={i} className="font-bold text-[14px] mt-4 mb-1" style={{ color: 'var(--toul-text)' }}>{formatInline(line.slice(3))}</h3>)
            continue
        }
        if (line.startsWith('# ')) {
            elements.push(<h2 key={i} className="font-bold text-[15px] mt-4 mb-2" style={{ color: 'var(--toul-text)' }}>{formatInline(line.slice(2))}</h2>)
            continue
        }

        // Bullet points
        if (line.match(/^[\s]*[-•]\s/)) {
            const content = line.replace(/^[\s]*[-•]\s/, '')
            elements.push(
                <div key={i} className="flex gap-2 pl-1 py-0.5">
                    <span className="shrink-0 mt-[2px]" style={{ color: 'var(--toul-accent)' }}>•</span>
                    <span>{formatInline(content)}</span>
                </div>
            )
            continue
        }

        // Numbered lists
        if (line.match(/^[\s]*\d+[.)]\s/)) {
            const content = line.replace(/^[\s]*\d+[.)]\s/, '')
            const num = line.match(/^[\s]*(\d+)/)?.[1]
            elements.push(
                <div key={i} className="flex gap-2 pl-1 py-0.5">
                    <span className="shrink-0 font-semibold text-[12px] min-w-[18px]" style={{ color: 'var(--toul-accent)' }}>{num}.</span>
                    <span>{formatInline(content)}</span>
                </div>
            )
            continue
        }

        // Empty lines
        if (line.trim() === '') {
            elements.push(<div key={i} className="h-2" />)
            continue
        }

        // Regular text
        elements.push(<p key={i} className="py-0.5">{formatInline(line)}</p>)
    }

    return <>{elements}</>
}

function formatInline(text: string): React.ReactNode {
    // Bold + italic, bold, italic, inline code
    const parts = text.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|`.*?`)/g)
    return parts.map((part, i) => {
        if (part.startsWith('***') && part.endsWith('***'))
            return <strong key={i} className="italic" style={{ color: 'var(--toul-text)' }}>{part.slice(3, -3)}</strong>
        if (part.startsWith('**') && part.endsWith('**'))
            return <strong key={i} style={{ color: 'var(--toul-text)' }}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*'))
            return <em key={i}>{part.slice(1, -1)}</em>
        if (part.startsWith('`') && part.endsWith('`'))
            return <code key={i} className="px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: 'var(--toul-border)', color: 'var(--toul-accent)' }}>{part.slice(1, -1)}</code>
        return <Fragment key={i}>{part}</Fragment>
    })
}

// ── Chat Interface ──────────────────────────────────────────────────────────
function ChatInterface({ storeId, storeName }: { storeId: string, storeName: string }) {
    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const [input, setInput] = useState('')

    const transport = useMemo(() => new DefaultChatTransport({
        api: '/api/toul-ai/chat',
        body: { storeId }
    }), [storeId])

    const chatHelpers = useChat({
        transport: transport as any,
        onError: (err: any) => {
            console.error('TOUL AI Error:', err)
        }
    })
    const { messages, sendMessage, status, setMessages }: any = chatHelpers
    const isLoading = status === 'streaming' || status === 'submitted'

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const currentInput = input.trim()
        if (!currentInput || isLoading) return
        setInput('')
        try {
            await sendMessage({ text: currentInput })
        } catch (err: any) {
            console.error('Submit Error:', err)
        }
    }

    const sendSuggestion = (text: string) => {
        if (isLoading) return
        sendMessage({ text })
    }

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    // Auto-focus input
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const suggestions = [
        { text: '¿Cómo va mi negocio?', icon: <TrendingUp className="w-3.5 h-3.5" /> },
        { text: '¿Tengo liquidez para comprar inventario?', icon: <Wallet className="w-3.5 h-3.5" /> },
        { text: '¿Qué producto debería impulsar?', icon: <Package className="w-3.5 h-3.5" /> },
        { text: '¿Qué debería hacer hoy para mejorar?', icon: <Target className="w-3.5 h-3.5" /> },
    ]

    return (
        <div className="flex h-[100dvh] overflow-hidden" style={{ background: 'var(--toul-bg)' }}>
            <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">

                {/* ── Header ─────────────────────────────────────────── */}
                <div className="h-14 flex items-center justify-between px-4 md:px-6 shrink-0"
                    style={{ borderBottom: '1px solid var(--toul-border)', background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
                    <div className="flex items-center gap-3">
                        <Link href="/" className="flex items-center justify-center active:scale-90 transition-transform"
                            style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.7)' }}>
                            <ArrowLeft size={17} strokeWidth={2} />
                        </Link>
                        <div style={{
                            width: 36, height: 36, borderRadius: 12,
                            background: 'var(--toul-accent-dim)',
                            border: '1px solid var(--toul-border-focused)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Brain size={17} strokeWidth={2} color="var(--toul-accent)" />
                        </div>
                        <div>
                            <h1 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--toul-text)', margin: 0 }}>TOUL AI</h1>
                            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--toul-text-dim)', margin: 0 }}>
                                Copiloto de negocio
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('¿Borrar la conversación actual?')) setMessages([])
                        }}
                        className="p-2 rounded-full transition-all hover:opacity-70"
                        style={{ color: 'var(--toul-text-subtle)' }}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>

                {/* ── Messages ───────────────────────────────────────── */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-5 scroll-smooth"
                >
                    {/* Empty State */}
                    {messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center px-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                                className="space-y-6 max-w-sm"
                            >
                                {/* Logo */}
                                <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center"
                                    style={{
                                        background: 'var(--toul-accent-dim)',
                                        border: '1px solid var(--toul-accent-glow)',
                                    }}>
                                    <Sparkles className="w-8 h-8" style={{ color: 'var(--toul-accent)' }} />
                                </div>

                                <div className="space-y-2">
                                    <h2 className="text-lg font-bold tracking-tight" style={{ color: 'var(--toul-text)' }}>
                                        Tu copiloto de negocio
                                    </h2>
                                    <p className="text-xs leading-relaxed" style={{ color: 'var(--toul-text-muted)' }}>
                                        Analizo tus ventas, inventario, gastos y deudas en tiempo real para darte recomendaciones estratégicas. Pregúntame lo que quieras.
                                    </p>
                                </div>

                                {/* Suggestions */}
                                <div className="grid grid-cols-1 gap-2 w-full">
                                    {suggestions.map((s, i) => (
                                        <motion.button
                                            key={i}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
                                            onClick={() => sendSuggestion(s.text)}
                                            className="flex items-center gap-3 px-4 py-3 text-left text-xs font-medium rounded-xl transition-all active:scale-[0.98]"
                                            style={{
                                                background: 'var(--toul-surface)',
                                                border: '1px solid var(--toul-border)',
                                                color: 'var(--toul-text-muted)',
                                            }}
                                        >
                                            <div className="p-1.5 rounded-lg shrink-0" style={{ background: 'var(--toul-accent-dim)', color: 'var(--toul-accent)' }}>
                                                {s.icon}
                                            </div>
                                            {s.text}
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {/* Message Bubbles */}
                    {messages.map((m: any) => {
                        const content = m.content || m.parts?.map((p: any) => p.text || '').join('') || ''
                        const isUser = m.role === 'user'

                        return (
                            <motion.div
                                key={m.id}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.25 }}
                                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex max-w-[88%] gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                                    {/* Avatar */}
                                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-1"
                                        style={isUser
                                            ? { background: 'var(--toul-border)', color: 'var(--toul-text-muted)' }
                                            : { background: 'var(--toul-accent-dim)', border: '1px solid var(--toul-accent-glow)', color: 'var(--toul-accent)' }
                                        }>
                                        {isUser
                                            ? <User className="w-3.5 h-3.5" />
                                            : <Brain className="w-3.5 h-3.5" />
                                        }
                                    </div>

                                    {/* Bubble */}
                                    <div
                                        className={`px-4 py-3 text-[13px] leading-relaxed ${isUser ? 'rounded-2xl rounded-tr-md' : 'rounded-2xl rounded-tl-md'}`}
                                        style={isUser
                                            ? { background: 'var(--toul-accent)', color: '#fff' }
                                            : { background: 'var(--toul-surface)', border: '1px solid var(--toul-border)', color: 'var(--toul-text-muted)' }
                                        }
                                    >
                                        {isUser ? content : renderMarkdown(content)}
                                        {!content && (
                                            <span className="text-xs italic" style={{ color: 'var(--toul-text-subtle)' }}>
                                                [Pensando...]
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )
                    })}

                    {/* Typing Indicator */}
                    {isLoading && !messages.some((m: any) => m.role === 'assistant' && status === 'streaming' && m === messages[messages.length - 1] && m.content) && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="flex justify-start"
                        >
                            <div className="flex gap-2.5">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                                    style={{ background: 'var(--toul-accent-dim)', border: '1px solid var(--toul-accent-glow)', color: 'var(--toul-accent)' }}>
                                    <Brain className="w-3.5 h-3.5" />
                                </div>
                                <div className="px-4 py-3 rounded-2xl rounded-tl-md"
                                    style={{ background: 'var(--toul-surface)', border: '1px solid var(--toul-border)' }}>
                                    <div className="flex gap-1.5 items-center">
                                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--toul-accent)', animationDelay: '0ms' }} />
                                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--toul-accent)', animationDelay: '150ms', animationDuration: '0.6s' }} />
                                        <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--toul-accent)', animationDelay: '300ms', animationDuration: '0.6s' }} />
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* ── Input Area ──────────────────────────────────────── */}
                <div className="px-4 md:px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--toul-border)', background: 'var(--toul-surface)' }}>
                    <form onSubmit={onSubmit} className="relative flex items-center gap-3">
                        <div className="flex-1 relative group">
                            <input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Pregúntale a tu copiloto..."
                                disabled={isLoading}
                                className="w-full rounded-xl pl-11 pr-4 py-3 text-sm font-medium outline-none transition-all disabled:opacity-50"
                                style={{
                                    background: 'var(--toul-bg)',
                                    border: '1px solid var(--toul-border)',
                                    color: 'var(--toul-text)',
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--toul-accent)'
                                    e.currentTarget.style.boxShadow = '0 0 0 3px var(--toul-accent-glow)'
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = 'var(--toul-border)'
                                    e.currentTarget.style.boxShadow = 'none'
                                }}
                            />
                            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: 'var(--toul-text-subtle)' }}>
                                <Sparkles className="w-4.5 h-4.5" />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className="p-3 rounded-xl transition-all active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                                background: input.trim() && !isLoading ? 'var(--toul-accent)' : 'var(--toul-border)',
                                color: input.trim() && !isLoading ? '#fff' : 'var(--toul-text-subtle)',
                                boxShadow: input.trim() && !isLoading ? '0 4px 16px var(--toul-accent-glow)' : 'none',
                            }}
                        >
                            <Send className="w-4.5 h-4.5" />
                        </button>
                    </form>
                    <p className="mt-3 text-[10px] text-center font-medium" style={{ color: 'var(--toul-text-subtle)' }}>
                        TOUL AI analiza tus datos reales de ventas, inventario, gastos y clientes.
                    </p>
                </div>
            </div>
        </div>
    )
}
