'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { httpsCallable } from 'firebase/functions';
import { firebaseFunctions } from '@/lib/firebase';
import { Eye, EyeOff, Loader2, User, Mail } from 'lucide-react';


export default function LoginPage() {
    // const { t } = useTranslation();
    const [identifier, setIdentifier] = useState(''); // email or username
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { signIn } = useAuth();
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            let emailToUse = identifier;

            // Check if identifier is email or username
            if (!identifier.includes('@')) {
                // It's a username, look up email
                const getUserByUsername = httpsCallable(firebaseFunctions, 'getUserByUsername');
                const result = await getUserByUsername({ username: identifier });
                const data = result.data as { email: string | null; found: boolean };

                if (!data.found || !data.email) {
                    throw new Error('User not found');
                }
                emailToUse = data.email;
            }

            await signIn(emailToUse, password);
            router.push('/');
        } catch (err: unknown) {
            const error = err as { message?: string; code?: string };
            if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setError('Yanlış şifre');
            } else if (error.code === 'auth/user-not-found') {
                setError('Kullanıcı bulunamadı');
            } else if (error.code === 'auth/too-many-requests') {
                setError('Çok fazla deneme. Lütfen bekleyin.');
            } else {
                setError(error.message || 'Login failed');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-amber-500/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-orange-500/10 to-transparent rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md mx-4">
                {/* Logo and branding */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-4 shadow-lg shadow-amber-500/20">
                        <span className="text-4xl font-bold text-slate-900">C</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">Calivery</h1>
                    <p className="text-slate-400">Admin Panel</p>
                </div>

                {/* Login card */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-8 shadow-2xl">
                    <h2 className="text-xl font-semibold text-white mb-6">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="identifier" className="block text-sm font-medium text-slate-300 mb-2">
                                Email or Username
                            </label>
                            <div className="relative">
                                <input
                                    type="text"
                                    id="identifier"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    className="w-full px-4 py-3 pl-11 rounded-xl bg-slate-900/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all"
                                    placeholder="Email or Username"
                                    required
                                />
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                                    {identifier.includes('@') ? <Mail size={18} /> : <User size={18} />}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900/50 border border-slate-600 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all pr-12"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900 font-semibold hover:from-amber-400 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-amber-500/20"
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 size={20} className="animate-spin" />
                                    Loading...
                                </span>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>
                </div>

                <p className="text-center text-slate-500 text-sm mt-6">
                    Fleet Management
                </p>
            </div>
        </div>
    );
}
