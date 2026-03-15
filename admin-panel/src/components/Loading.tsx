

export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900">
            <div className="relative flex items-center justify-center">
                {/* Outer spinning ring */}
                <div className="absolute inset-0 rounded-full border-t-4 border-amber-500 animate-spin w-32 h-32 blur-sm opacity-70"></div>
                <div className="absolute inset-0 rounded-full border-b-4 border-orange-500 animate-spin-slow w-32 h-32 blur-md opacity-50"></div>

                {/* Middle pulsing glow */}
                <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse w-24 h-24 m-auto"></div>

                {/* Logo container with scale animation */}
                <div className="relative w-36 h-36 flex items-center justify-center z-10 animate-bounce-slow">
                    <img
                        src="/logo-nb.png"
                        alt="Loading"
                        className="w-36 h-36 object-contain drop-shadow-[0_0_15px_rgba(245,158,11,0.5)]"
                    />
                </div>
            </div>

            <style jsx>{`
                @keyframes spin-slow {
                    from { transform: rotate(360deg); }
                    to { transform: rotate(0deg); }
                }
                @keyframes bounce-slow {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                .animate-spin-slow {
                    animation: spin-slow 3s linear infinite;
                }
                .animate-bounce-slow {
                    animation: bounce-slow 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
