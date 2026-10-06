import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

function valueOf(row, ...keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return '—';
}

function statusLabel(value) {
  if (value === true) return 'सक्रिय';
  if (value === false) return 'निष्क्रिय';

  const text = String(value || '').toLowerCase();

  if (
    text === 'active' ||
    text === 'available' ||
    text === 'on_duty' ||
    text === 'working'
  ) {
    return 'सक्रिय';
  }

  if (
    text === 'inactive' ||
    text === 'disabled' ||
    text === 'off_duty'
  ) {
    return 'निष्क्रिय';
  }

  return value || '—';
}

export default function Officers() {
  const [officers, setOfficers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOfficers = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await api('/admin/officers');

      if (Array.isArray(data)) {
        setOfficers(data);
      } else if (Array.isArray(data?.officers)) {
        setOfficers(data.officers);
      } else {
        setOfficers([]);
      }
    } catch (err) {
      setError(err?.message || 'अधिकारी सूची लोड नहीं हो सकी।');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOfficers();
  }, [loadOfficers]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>अधिकारी</h1>
          <div style={{ color: 'var(--ink-3)', marginTop: 4 }}>
            पुलिस अधिकारियों की सूची
          </div>
        </div>

        <button
          type="button"
          onClick={loadOfficers}
          disabled={loading}
          className="button"
        >
          {loading ? 'लोड हो रहा है...' : '↻ रीफ्रेश'}
        </button>
      </div>

      {error && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            borderColor: '#ef4444',
            color: '#b91c1c',
          }}
        >
          <strong>डेटा लोड करने में समस्या</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty">
            <strong>अधिकारी सूची लोड हो रही है...</strong>
          </div>
        ) : officers.length === 0 ? (
          <div className="empty">
            <strong>कोई अधिकारी नहीं मिला</strong>
            <div style={{ marginTop: 6 }}>
              Backend से अभी कोई officer record उपलब्ध नहीं है।
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 900,
              }}
            >
              <thead>
                <tr>
                  <th style={thStyle}>नाम</th>
                  <th style={thStyle}>पुलिस ID / Badge</th>
                  <th style={thStyle}>मोबाइल</th>
                  <th style={thStyle}>पद / Rank</th>
                  <th style={thStyle}>थाना</th>
                  <th style={thStyle}>ज़िला</th>
                  <th style={thStyle}>स्थिति</th>
                </tr>
              </thead>

              <tbody>
                {officers.map((officer, index) => {
                  const id =
                    officer?.id ??
                    officer?.officerId ??
                    officer?.officer_id ??
                    index;

                  const name = valueOf(
                    officer,
                    'name',
                    'fullName',
                    'full_name'
                  );

                  const badgeId = valueOf(
                    officer,
                    'badgeId',
                    'badge_id',
                    'pno',
                    'policeId',
                    'police_id'
                  );

                  const mobile = valueOf(
                    officer,
                    'mobile',
                    'phone',
                    'phoneNumber',
                    'phone_number'
                  );

                  const rank = valueOf(
                    officer,
                    'rank',
                    'designation'
                  );

                  const station = valueOf(
                    officer,
                    'station',
                    'stationName',
                    'station_name'
                  );

                  const district = valueOf(
                    officer,
                    'district',
                    'districtName',
                    'district_name'
                  );

                  const rawStatus =
                    officer?.status ??
                    officer?.isActive ??
                    officer?.is_active ??
                    officer?.availability;

                  return (
                    <tr key={id}>
                      <td style={tdStyle}>
                        <strong>{name}</strong>
                      </td>

                      <td style={tdStyle}>{badgeId}</td>

                      <td style={tdStyle}>{mobile}</td>

                      <td style={tdStyle}>{rank}</td>

                      <td style={tdStyle}>{station}</td>

                      <td style={tdStyle}>{district}</td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '4px 9px',
                            borderRadius: 999,
                            background:
                              rawStatus === false ||
                              String(rawStatus).toLowerCase() ===
                                'inactive'
                                ? '#fee2e2'
                                : '#dcfce7',
                            color:
                              rawStatus === false ||
                              String(rawStatus).toLowerCase() ===
                                'inactive'
                                ? '#b91c1c'
                                : '#166534',
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          {statusLabel(rawStatus)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const thStyle = {
  textAlign: 'left',
  padding: '12px 10px',
  borderBottom: '1px solid var(--line, #e5e7eb)',
  whiteSpace: 'nowrap',
  fontSize: 13,
};

const tdStyle = {
  padding: '13px 10px',
  borderBottom: '1px solid var(--line, #e5e7eb)',
  verticalAlign: 'top',
  fontSize: 14,
};