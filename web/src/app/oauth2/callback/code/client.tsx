"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import { createOrUpdateOAuthAccount } from "@/lib/account";
import {
    clearPendingOAuthState,
    formatOAuthErrorMessage,
    getOAuthReturnTo,
    normalizeBindingGameId,
    normalizeBindingServer,
    resolveOAuthAuthorization,
    type OAuthBinding,
} from "@/lib/oauth";

export default function CallbackClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [bindings, setBindings] = useState<OAuthBinding[]>([]);
    const [resolved, setResolved] = useState<Awaited<ReturnType<typeof resolveOAuthAuthorization>> | null>(null);

    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const oauthError = searchParams.get("error");
    const returnTo = useMemo(() => getOAuthReturnTo(), []);

    useEffect(() => {
        let cancelled = false;
        if (oauthError) {
            clearPendingOAuthState();
            setError(formatOAuthErrorMessage(oauthError));
            setLoading(false);
            return;
        }
        if (!code || !state) {
            clearPendingOAuthState();
            setError(formatOAuthErrorMessage("OAuth2 回调参数不完整"));
            setLoading(false);
            return;
        }

        void (async () => {
            try {
                const result = await resolveOAuthAuthorization(code, state);
                if (cancelled) return;
                setResolved(result);
                setBindings(result.bindings);
                if (result.bindings.length === 1) {
                    await handleBinding(result.bindings[0]!, result);
                } else {
                    setLoading(false);
                }
            } catch (err) {
                clearPendingOAuthState();
                if (!cancelled) {
                    setError(formatOAuthErrorMessage(err instanceof Error ? err.message : "OAuth2 处理失败"));
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [code, state, oauthError]);

    const handleBinding = async (
        binding: OAuthBinding,
        source = resolved,
    ) => {
        if (!source) return;
        const server = normalizeBindingServer(binding);
        const gameId = normalizeBindingGameId(binding);
        if (!server || !gameId) {
            setError("无法从 OAuth2 绑定中解析服务器或 UID");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const account = createOrUpdateOAuthAccount({
                binding,
                profile: source.profile,
                tokenSet: source.tokenSet,
            });
            clearPendingOAuthState();
            router.replace(`${returnTo}${returnTo.includes("?") ? "&" : "?"}oauth=success&account=${encodeURIComponent(account.id)}`);
        } catch (err) {
            clearPendingOAuthState();
            setError(formatOAuthErrorMessage(err instanceof Error ? err.message : "同步授权账号数据失败"));
            setLoading(false);
        }
    };

    return (
        <MainLayout>
            <div className="container mx-auto px-4 sm:px-6 py-10 max-w-3xl">
                <div className="glass-card p-6 sm:p-8 rounded-2xl">
                    <div className="inline-flex items-center gap-2 px-4 py-2 border border-miku/30 bg-miku/5 rounded-full mb-4">
                        <span className="text-miku text-xs font-bold tracking-widest uppercase">OAuth2 Callback</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-black text-primary-text mb-3">Haruki 授权处理中</h1>
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <div className="w-4 h-4 border-2 border-miku/20 border-t-miku rounded-full animate-spin" />
                            正在完成授权与账号同步…
                        </div>
                    ) : error ? (
                        <div className="p-4 rounded-xl border border-red-200 bg-red-50">
                            <p className="text-sm font-bold text-red-600">授权绑定失败</p>
                            <p className="text-xs text-red-500 mt-1 break-all">{error}</p>
                            <button
                                onClick={() => router.replace(returnTo)}
                                className="mt-4 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors"
                            >
                                返回来源页面
                            </button>
                        </div>
                    ) : bindings.length > 1 ? (
                        <div>
                            <p className="text-sm text-slate-500 mb-4">检测到多个可用绑定，请选择要接入 Moesekai 的账号。</p>
                            <div className="space-y-3">
                                {bindings.map((binding, index) => {
                                    const server = normalizeBindingServer(binding) || "未知服";
                                    const gameId = normalizeBindingGameId(binding) || "未知 UID";
                                    return (
                                        <button
                                            key={`${binding.bindingId ?? binding.id ?? index}`}
                                            onClick={() => void handleBinding(binding)}
                                            className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-miku/40 hover:bg-miku/5 transition-all"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-bold text-primary-text">{gameId}</p>
                                                    <p className="text-xs text-slate-500 mt-1">服务器：{server}</p>
                                                </div>
                                                <span className="text-xs font-bold text-miku">接入 →</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </MainLayout>
    );
}
