const C = { navy: '#2c3e7e' };

export default function Compliance() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold" style={{ color: C.navy }}>Compliance Notes</h2>
        <p className="text-sm text-gray-500 mt-0.5">Oregon labor law and federal leave compliance reference</p>
      </div>

      <div className="space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-lg" style={{ color: C.navy }}>FMLA — Family and Medical Leave Act</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium">Federal</span>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Entitlement:</strong> Up to 12 weeks (480 hours, prorated by contract) per rolling 12-month period</p>
            <p><strong>Eligibility:</strong> 12+ months of employment, 1,250+ hours worked in prior 12 months</p>
            <p><strong>Qualifying reasons:</strong> Birth/adoption, serious health condition (self or family), military family leave</p>
            <p><strong>Rolling period:</strong> Starts from first date of FMLA use; renews 12 months later</p>
            <p><strong>Concurrent with PLO:</strong> When FMLA + PLO overlap, hours deduct from both entitlements simultaneously</p>
            <p><strong>Documentation:</strong> Employer may require medical certification within 15 calendar days</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-lg" style={{ color: C.navy }}>OFLA — Oregon Family Leave Act</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-medium">State</span>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Entitlement:</strong> Up to 12 weeks (480 hours, prorated by contract) per rolling 12-month period</p>
            <p><strong>Eligibility:</strong> 180+ calendar days of employment, 25+ hours/week average</p>
            <p><strong>Qualifying reasons:</strong> Serious health condition, parental leave, sick child, domestic violence, bereavement</p>
            <p><strong>Separate from PLO:</strong> As of July 2024, OFLA and PLO are tracked independently (no longer concurrent)</p>
            <p><strong>Bereavement:</strong> Up to 2 weeks per family member death (deducts from 12-week total)</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-lg" style={{ color: C.navy }}>PLO — Paid Leave Oregon</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-medium">State</span>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Entitlement:</strong> Up to 12 weeks (480 hours, prorated by contract) per rolling 12-month period</p>
            <p><strong>Eligibility:</strong> $1,000+ earned in base year and active claim filed with state</p>
            <p><strong>Qualifying reasons:</strong> Family leave, medical leave, safe leave (domestic violence, harassment, stalking)</p>
            <p><strong>Concurrent with FMLA:</strong> When qualifying event overlaps, PLO + FMLA run concurrently</p>
            <p><strong>Not concurrent with OFLA:</strong> As of July 2024, these run independently</p>
            <p><strong>Funding:</strong> Payroll tax — employer and employee contributions to state insurance program</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-lg" style={{ color: C.navy }}>Oregon Labor Law — Breaks & Overtime</h3>
            <span className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 font-medium">State</span>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Overtime:</strong> 1.5× regular rate for all hours over 40 in a workweek (ORS 653.261)</p>
            <p><strong>Meal breaks:</strong> 30-minute unpaid break for shifts of 6+ hours. Must be provided before end of 6th hour.</p>
            <p><strong>Rest breaks:</strong> Paid 10-minute break per 4-hour segment worked. Cannot be combined with meal break.</p>
            <p><strong>Oregon Sick Time:</strong> Employees accrue 1 hour of sick time per 30 hours worked, up to 40 hrs/year.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-lg" style={{ color: C.navy }}>Rolling 12-Month Period Rules</h3>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <p><strong>Period start:</strong> First date employee uses that specific protected leave type</p>
            <p><strong>Period end:</strong> Start date + 12 months − 1 day</p>
            <p><strong>Independent tracking:</strong> FMLA, OFLA, and PLO each have their own period per employee</p>
            <p><strong>Renewal:</strong> After period expires, next use starts a fresh 12-month period with full entitlement</p>
            <p><strong>Concurrent leave:</strong> When FMLA + PLO run concurrently, hours deducted from both periods</p>
            <p><strong>OFLA + PLO:</strong> No longer concurrent as of July 2024 — tracked separately</p>
            <p><strong>Proration:</strong> (contract_days / 260) × 480 = hours available</p>
          </div>
        </div>
      </div>
    </div>
  );
}