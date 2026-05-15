import { NextRequest, NextResponse } from "next/server";

import { Membership, MembershipPlan, User } from "@/database/models";
import { buildMembershipAgreementPdf } from "@/lib/pdf/membershipAgreementPdf";

export const runtime = "nodejs";

function toNumber(value: unknown, defaultValue = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : defaultValue;
}

function getPlainData(value: any) {
    return value?.get ? value.get({ plain: true }) : value;
}

function sanitizeFileName(value: string) {
    return value
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
}

function jsonError(message: string, status = 500) {
    return NextResponse.json(
        {
            success: false,
            message,
            data: null,
        },
        { status }
    );
}

async function findHistoryWithRelations(id: number) {
    return Membership.findByPk(id, {
        include: [
            {
                model: User,
                as: "user",
                attributes: ["id", "name", "email", "phone", "role", "isActive"],
            },
            {
                model: User,
                as: "sales",
                attributes: ["id", "name", "email", "phone", "role"],
                required: false,
            },
            {
                model: User,
                as: "processedBy",
                attributes: ["id", "name", "email", "phone", "role", "isActive"],
                required: false,
            },
            {
                model: MembershipPlan,
                as: "plan",
                required: false,
            },
        ],
    });
}

/**
 * GET /api/admin/payment-history/[id]/agreement-pdf
 *
 * Generate ulang PDF Membership Agreement.
 *
 * Query:
 * ?viewerUserId=1
 * atau:
 * ?viewerRole=admin
 *
 * Optional:
 * &download=true
 */
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const historyId = toNumber(id, 0);

        if (!historyId) {
            return jsonError("ID riwayat tidak valid", 400);
        }

        const searchParams = request.nextUrl.searchParams;

        const viewerRole = String(searchParams.get("viewerRole") ?? "")
            .trim()
            .toLowerCase();

        const viewerUserId = toNumber(searchParams.get("viewerUserId"), 0);

        let allowed = false;

        if (viewerRole === "admin" || viewerRole === "manager") {
            allowed = true;
        }

        if (!allowed && viewerUserId) {
            const viewer = await User.findByPk(viewerUserId, {
                attributes: ["id", "name", "email", "phone", "role", "isActive"],
            });

            if (!viewer) {
                return jsonError("User pembuka PDF tidak ditemukan", 404);
            }

            const role = String(viewer.get("role") ?? "").toLowerCase();
            const isActive = Boolean(viewer.get("isActive") ?? true);

            if (!isActive) {
                return jsonError("User pembuka PDF tidak aktif", 403);
            }

            if (role === "admin" || role === "manager") {
                allowed = true;
            }
        }

        if (!allowed) {
            return jsonError(
                "Hanya admin atau manager yang boleh membuka PDF ini",
                403
            );
        }

        const history = await findHistoryWithRelations(historyId);

        if (!history) {
            return jsonError("Riwayat pembayaran tidak ditemukan", 404);
        }

        const data = getPlainData(history);
        const user = data?.user;
        const plan = data?.plan;

        if (!user) {
            return jsonError("Data member pada riwayat ini tidak ditemukan", 404);
        }

        const paymentStatus = String(
            data?.paymentStatus ?? data?.payment_status ?? ""
        ).toLowerCase();

        if (paymentStatus !== "paid") {
            return jsonError(
                "PDF hanya bisa dibuka untuk pembayaran yang sudah paid",
                400
            );
        }

        const transactionCode = `PFC-${String(data?.id ?? historyId).padStart(
            6,
            "0"
        )}`;

        const pdfBuffer = await buildMembershipAgreementPdf({
            user: {
                id: user?.id,
                name: user?.name,
                email: user?.email,
                phone: user?.phone,
            },
            membership: {
                id: data?.id,
                packageName: data?.packageName ?? data?.package_name,
                packagePrice: data?.packagePrice ?? data?.package_price,
                paymentMethod: data?.paymentMethod ?? data?.payment_method,
                paymentStatus: data?.paymentStatus ?? data?.payment_status,
                paidAmount: data?.paidAmount ?? data?.paid_amount,
                paidAt: data?.paidAt ?? data?.paid_at,
                memberStatus: data?.memberStatus ?? data?.member_status,
                startedAt: data?.startedAt ?? data?.started_at,
                expiredAt: data?.expiredAt ?? data?.expired_at,
                notes: data?.notes,
            },
            plan: plan
                ? {
                    name: plan?.name,
                    programName: plan?.programName ?? plan?.program_name,
                    packageCode: plan?.packageCode ?? plan?.package_code,
                    durationDays: plan?.durationDays ?? plan?.duration_days,
                    personalTrainerSessions:
                        plan?.personalTrainerSessions ??
                        plan?.personal_trainer_sessions,
                    pilatesSessions: plan?.pilatesSessions ?? plan?.pilates_sessions,
                    freeMembershipDays:
                        plan?.freeMembershipDays ?? plan?.free_membership_days,
                    benefits: Array.isArray(plan?.benefits) ? plan.benefits : [],
                }
                : null,
        });

        const memberName = sanitizeFileName(String(user?.name ?? "Member"));
        const fileName = `Prima-Fitness-Club-Membership-${transactionCode}-${memberName}.pdf`;

        const download = String(searchParams.get("download") ?? "false") === "true";

        const pdfBody = new Uint8Array(pdfBuffer);

        return new NextResponse(pdfBody, {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `${download ? "attachment" : "inline"
                    }; filename="${fileName}"`,
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        });
    } catch (error) {
        console.error("GET MEMBERSHIP AGREEMENT PDF ERROR:", error);

        return jsonError("Gagal membuat PDF membership agreement", 500);
    }
}