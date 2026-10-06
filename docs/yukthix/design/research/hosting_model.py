"""YukthiX monthly hosting cost model. All prices USD/month, $1 = ₹96. Estimates, see assumptions."""
FX = 96

# Growth stages: employees on HRMS, proctored attempts per month, recruiter seats
STAGES = [
    ("Pilot (Y1)", 5_000, 5_000, 50),
    ("Growth (Y2)", 25_000, 25_000, 250),
    ("Scale (Y3)", 100_000, 100_000, 1_000),
    ("Large (Y4+)", 500_000, 500_000, 5_000),
]

# Sizing per stage (vCPU counts, 4 GB RAM per vCPU assumed)
#   app = API + web (NestJS / Next.js), work = background workers (payroll, PDF, notifications, imports)
#   proc = proctoring pipeline (frame analysis, recording processing, live-video relay), baseline (bursts autoscale)
#   db = primary Postgres vCPU (x2 for high-availability standby), rep = read-replica vCPU (analytics / reports)
#   cache = Redis vCPU, nonprod = staging + sandbox as fraction of prod compute
SIZE = {
    "Pilot (Y1)":  dict(app=4,  work=2,  proc=2,  db=2,  rep=0,  cache=1, nonprod=0.30, dr=False),
    "Growth (Y2)": dict(app=8,  work=4,  proc=4,  db=4,  rep=2,  cache=2, nonprod=0.25, dr=False),
    "Scale (Y3)":  dict(app=16, work=8,  proc=12, db=8,  rep=8,  cache=4, nonprod=0.20, dr=True),
    "Large (Y4+)": dict(app=48, work=24, proc=40, db=32, rep=32, cache=8, nonprod=0.15, dr=True),
}

# Data volumes
HR_GB_PER_EMP_YEAR = 0.03      # documents, payslip PDFs, photos (30 MB per employee per year)
PROC_GB_PER_ATTEMPT = 0.04     # average recording + stills per attempt (mix of AI-only and record-and-review)
PROC_RETENTION_MONTHS = 1      # default 30 days (T05 G17); longer = storage add-on paid by the tenant
DB_GB_PER_EMP = 0.02           # Postgres data incl. indexes and audit (20 MB per employee)
EGRESS_GB_PER_EMP = 0.03       # app + mobile traffic per employee per month
EGRESS_GB_PER_ATTEMPT = 0.015  # reviewer playback of flagged segments + live proctor viewing share
LOG_GB_PER_1K_EMP = 1.0        # logs per month, kept 1 year (DPDP Rules 2025; covers CERT-In 180 days)
AI_USD_PER_EMP = 0.004         # small included AI (helpdesk answers, summaries); heavy use = AI credits add-on
AI_USD_PER_ATTEMPT = 0.01      # transcript scoring / summaries per attempt
EMAIL_USD_PER_EMP = 0.002      # ~20 transactional emails per employee per month

PROVIDERS = {
    # vcpu: $/vCPU-month incl. 4 GB RAM; dbv: $/vCPU-month for managed Postgres incl. HA pair (per primary vCPU)
    # obj: $/GB-month object storage; blk: $/GB-month block/db storage; egress: $/GB after free allowance
    # free_egress_gb: monthly free egress; fixed: WAF/CDN/monitoring/misc fixed monthly
    "AWS Mumbai, on-demand (managed everything)": dict(vcpu=36, dbv=130, cachev=45, obj=0.025, blk=0.131, egress=0.109, free_egress_gb=1000, fixed=250, note="RDS Multi-AZ, ElastiCache, S3, CloudFront, CloudWatch"),
    "AWS Mumbai, 1-yr savings plan + reserved DB": dict(vcpu=23, dbv=85, cachev=30, obj=0.025, blk=0.131, egress=0.109, free_egress_gb=1000, fixed=250, note="~35% off compute and DB for a 1-year commitment"),
    "DigitalOcean Bangalore (managed DB)": dict(vcpu=12, dbv=61, cachev=15, obj=0.02, blk=0.10, egress=0.01, free_egress_gb=4000, fixed=60, note="Droplets, Managed Postgres with standby, Spaces; pooled bandwidth"),
    "E2E Networks India (managed DB)": dict(vcpu=11.7, dbv=60, cachev=12, obj=0.017, blk=0.06, egress=0.0, free_egress_gb=10**9, fixed=40, note="INR billing; July 2026 price update applies; verify SKUs"),
    "Oracle Cloud Mumbai/Hyderabad (Arm, self-run Postgres)": dict(vcpu=11.7, dbv=23.4, cachev=11.7, obj=0.0255, blk=0.0425, egress=0.0085, free_egress_gb=10_000, fixed=40, note="Ampere A1 $0.01/OCPU-h + $0.0015/GB-h; 10 TB egress free; Postgres run by us on 2 VMs"),
    "Hetzner dedicated (EU/US only, self-run everything)": dict(vcpu=4.2, dbv=8.5, cachev=4.2, obj=0.015, blk=0.0, egress=0.0, free_egress_gb=10**9, fixed=40, note="No India region: only for non-Indian tenants, DR copies or backups"),
}


def cost(provider, stage):
    p = PROVIDERS[provider]
    name, emp, att, rec = stage
    s = SIZE[name]
    compute_vcpu = s["app"] + s["work"] + s["proc"]
    compute = compute_vcpu * p["vcpu"] * (1 + s["nonprod"])
    db = s["db"] * p["dbv"] + s["rep"] * p["vcpu"] * (1.2 if p["dbv"] > 50 else 1)
    cache = s["cache"] * p["cachev"]
    db_gb = emp * DB_GB_PER_EMP * 1.5 + 50          # +50 GB base, x1.5 headroom
    db_storage = db_gb * max(p["blk"], 0.02) * 2    # primary + standby
    backup = db_gb * 3 * p["obj"]                   # PITR + snapshots ~3x DB size in object storage
    obj_gb = emp * HR_GB_PER_EMP_YEAR * 2 + att * PROC_GB_PER_ATTEMPT * PROC_RETENTION_MONTHS
    obj = obj_gb * p["obj"]
    egress_gb = emp * EGRESS_GB_PER_EMP + att * EGRESS_GB_PER_ATTEMPT
    egress = max(0, egress_gb - p["free_egress_gb"]) * p["egress"]
    logs = emp / 1000 * LOG_GB_PER_1K_EMP * 12 * 0.03 + 20   # 12 months kept (DPDP Rules 2025), ~$0.03/GB + base
    ai = emp * AI_USD_PER_EMP + att * AI_USD_PER_ATTEMPT
    email = emp * EMAIL_USD_PER_EMP
    infra = compute + db + cache + db_storage + backup + obj + egress + logs + p["fixed"]
    if s["dr"]:
        infra *= 1.25   # warm standby in second Indian region (data + small compute)
    total = infra + ai + email
    revenue = emp + att + rec
    return dict(compute=compute, db=db + cache + db_storage + backup, storage=obj, egress=egress,
                other=logs + p["fixed"], ai=ai + email, total=total, revenue=revenue,
                per_emp=total / emp, obj_gb=obj_gb, egress_gb=egress_gb, vcpu=compute_vcpu)


if __name__ == "__main__":
    for st in STAGES:
        print(f"\n== {st[0]}: {st[1]:,} employees, {st[2]:,} attempts/mo, {st[3]:,} recruiters; revenue ${st[1]+st[2]+st[3]:,}/mo")
        for prov in PROVIDERS:
            c = cost(prov, st)
            print(f"  {prov[:48]:48} ${c['total']:>9,.0f}/mo  (₹{c['total']*FX/100000:,.2f} L)  server cost = {100*c['total']/c['revenue']:5.1f}% of revenue  "
                  f"[compute {c['compute']:,.0f} db {c['db']:,.0f} storage {c['storage']:,.0f} egress {c['egress']:,.0f} other {c['other']:,.0f} ai {c['ai']:,.0f}]")
    # self-check: costs rise with stage for every provider
    for prov in PROVIDERS:
        t = [cost(prov, s)["total"] for s in STAGES]
        assert t == sorted(t), prov
    print("\nchecks ok")
