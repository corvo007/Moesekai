"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MainLayout from "@/components/MainLayout";
import {
    createOrUpdateOAuthAccount,
    fetchAccountGameData,
    type HarukiApiResult,
} from "@/lib/account";
import {
    clearPendingOAuthState,
    formatOAuthErrorMessage,
    getOAuthReturnTo,
    normalizeBindingGameId,
    normalizeBindingServer,
    resolveOAuthAuthorization,
    type OAuthBinding,
} from "@/lib/oauth";

function normalizeInitialData(payload: Record<string, unknown>): HarukiApiResult | null {
    if (!payload.userGamedata) return null;
    return {
        success: true,
        userGamedata: payload.userGamedata as HarukiApiResult["userGamedata"],
        userDecks: (payload.userDecks as HarukiApiResult["userDecks"]) || [],
        userCharacters: (payload.userCharacters as HarukiApiResult["userCharacters"]) || [],
        userChallengeLiveSoloStages: (payload.userChallengeLiveSoloStages as HarukiApiResult["userChallengeLiveSoloStages"]) || [],
        userChallengeLiveSoloResults: (payload.userChallengeLiveSoloResults as HarukiApiResult["userChallengeLiveSoloResults"]) || [],
        userChallengeLiveSoloHighScoreRewards: (payload.userChallengeLiveSoloHighScoreRewards as HarukiApiResult["userChallengeLiveSoloHighScoreRewards"]) || [],
        userBonds: (payload.userBonds as HarukiApiResult["userBonds"]) || [],
        userMaterials: (payload.userMaterials as HarukiApiResult["userMaterials"]) || [],
        userAreas: (payload.userAreas as HarukiApiResult["userAreas"]) || [],
        userMysekaiFixtureGameCharacterPerformanceBonuses: (payload.userMysekaiFixtureGameCharacterPerformanceBonuses as HarukiApiResult["userMysekaiFixtureGameCharacterPerformanceBonuses"]) || [],
        userMysekaiGates: (payload.userMysekaiGates as HarukiApiResult["userMysekaiGates"]) || [],
        uploadTime: typeof payload.upload_time === "number" ? payload.upload_time : undefined,
    };
}

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
            const payload = await fetchAccountGameData({
                id: `${server}_${gameId}`,
                gameId,
                server,
                nickname: "",
                avatarCharacterId: null,
                avatarCardId: null,
                isApiPublic: false,
                authSource: "oauth2",
                oauthSubject: String(source.profile?.sub ?? source.profile?.id ?? source.profile?.userId ?? "") || null,
                oauthScopes: source.tokenSet.scope,
                oauthToken: {
                    accessToken: source.tokenSet.accessToken,
                    refreshToken: source.tokenSet.refreshToken,
                    expiresAt: source.tokenSet.expiresAt,
                    tokenType: source.tokenSet.tokenType,
                    scope: source.tokenSet.scope,
                },
                oauthBindingId: String(binding.bindingId ?? binding.id ?? "") || null,
                lastSyncAt: null,
                authError: null,
                userCharacters: null,
                userGamedata: null,
                userDecks: null,
                userChallengeLiveSoloStages: null,
                userChallengeLiveSoloResults: null,
                userChallengeLiveSoloHighScoreRewards: null,
                userBonds: null,
                userMaterials: null,
                userAreas: null,
                userMysekaiFixtureGameCharacterPerformanceBonuses: null,
                userMysekaiGates: null,
                uploadTime: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }, [
                "userGamedata",
                "userDecks",
                "userCharacters",
                "userChallengeLiveSoloStages",
                "userChallengeLiveSoloResults",
                "userChallengeLiveSoloHighScoreRewards",
                "userBonds",
                "userMaterials",
                "userAreas",
                "userMysekaiFixtureGameCharacterPerformanceBonuses",
                "userMysekaiGates",
                "upload_time",
            ]);

            const account = createOrUpdateOAuthAccount({
                binding,
                profile: source.profile,
                tokenSet: source.tokenSet,
                initialData: normalizeInitialData(payload),
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
