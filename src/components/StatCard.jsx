export default function StatCard({ title, label, value, subtext, colorClass }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">{title}</p>
      {label && <p className="text-xs text-gray-500 mb-2">{label}</p>}
      <p className={`text-3xl font-bold ${colorClass || 'text-gray-900'}`}>{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
  )
}
