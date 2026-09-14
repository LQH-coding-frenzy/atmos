# Azure for Students Guardrails

Atmos uses Azure only for finite Container Apps Jobs. The primary application remains operational if Azure credit is exhausted.

## Required Guardrails

- Keep subscription `Azure for Students`; never upgrade it to pay-as-you-go.
- Record current remaining credit before each meaningful Azure provisioning step.
- Keep `atmos-student-credit-guardrail` as a monthly USD 10 subscription budget with Owner notifications at 50%, 75%, 90%, and 100% actual spend.
- Azure budgets alert only. They do not stop resources, so stop Azure work before the owner-approved USD 10 consumption limit.
- Do not register `Microsoft.App`, create a resource group, or provision Container Apps until the separate identity and IaC tasks are complete.
- Use Singapore only when Azure resources are later approved and available there.

## Credit Exhaustion

If credit approaches the approved limit or Azure disables the student subscription, stop Azure tasks. Do not convert to paid billing, and keep the Worker, Vercel, Supabase, and Cloudflare production lanes available.
