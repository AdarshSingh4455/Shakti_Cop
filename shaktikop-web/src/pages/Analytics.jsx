import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

function Card({ title, value, subtitle }) {
  return (
    <div
      className="card"
      style={{
        padding: 18,
        minHeight: 110,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ color: 'var(--ink-3)', fontSize: 14 }}>
        {title}
      </div>

      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          color: 'var(--ink)',
        }}
      >
        {value ?? 0}
      </div>

      {subtitle ? (
        <div
          style={{
            color: 'var(--ink-3)',
            fontSize: 12,
          }}
        >
          {subtitle}
        </div>
      ) : null}
    </div>
  );
}

function Analytics() {
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    category: '',
    status: '',
    station: '',
    officerId: '',
  });

  const [options, setOptions] = useState({
    categories: [],
    stations: [],
    statuses: [],
    officers: [],
  });

  const [overview, setOverview] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [sla, setSla] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [stationsSummary, setStationsSummary] = useState([]);

  const [selectedDistrict, setSelectedDistrict] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams();

    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    return params.toString();
  }, [filters]);

  async function loadAnalytics() {
    setLoading(true);
    setError('');

    try {
      const suffix = queryString ? `?${queryString}` : '';

      const leaderboardUrl = queryString
        ? `/admin/analytics/officer-leaderboard?${queryString}&sortBy=resolved`
        : '/admin/analytics/officer-leaderboard?sortBy=resolved';

      const [overviewData, optionsData, leaderboardData, slaData] =
        await Promise.all([
          api(`/admin/analytics/overview${suffix}`),

          api('/admin/analytics/filter-options'),

          api(leaderboardUrl),

          api('/admin/analytics/sla-at-risk?thresholdPercent=80'),
        ]);

      setOverview(overviewData || {});

      setOptions({
        categories: optionsData?.categories || [],
        stations: optionsData?.stations || [],
        statuses: optionsData?.statuses || [],
        officers: optionsData?.officers || [],
      });

      setLeaderboard(
        leaderboardData?.items ||
          leaderboardData?.officers ||
          leaderboardData?.rows ||
          []
      );

      setSla(slaData || null);
    } catch (err) {
      console.error('Analytics load error:', err);

      setError(
        err?.message ||
          'Analytics data लोड नहीं हो सका। कृपया Backend और login की जाँच करें।'
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadDistricts() {
    try {
      const params = new URLSearchParams();

      if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }

      if (filters.dateTo) {
        params.set('dateTo', filters.dateTo);
      }

      const suffix = params.toString()
        ? `?${params.toString()}`
        : '';

      const data = await api(
        `/admin/analytics/districts-summary${suffix}`
      );

      setDistricts(
        data?.items ||
          data?.districts ||
          data?.rows ||
          (Array.isArray(data) ? data : [])
      );
    } catch (err) {
      console.error('District summary error:', err);
      setDistricts([]);
    }
  }

  async function loadStationSummary(district) {
    if (!district) {
      setStationsSummary([]);
      return;
    }

    try {
      const params = new URLSearchParams();

      params.set('district', district);

      if (filters.dateFrom) {
        params.set('dateFrom', filters.dateFrom);
      }

      if (filters.dateTo) {
        params.set('dateTo', filters.dateTo);
      }

      const data = await api(
        `/admin/analytics/stations-summary?${params.toString()}`
      );

      setStationsSummary(
        data?.items ||
          data?.stations ||
          data?.rows ||
          (Array.isArray(data) ? data : [])
      );
    } catch (err) {
      console.error('Station summary error:', err);
      setStationsSummary([]);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, [queryString]);

  useEffect(() => {
    loadDistricts();
  }, [filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    loadStationSummary(selectedDistrict);
  }, [
    selectedDistrict,
    filters.dateFrom,
    filters.dateTo,
  ]);

  function updateFilter(name, value) {
    setFilters((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function resetFilters() {
    setFilters({
      dateFrom: '',
      dateTo: '',
      category: '',
      status: '',
      station: '',
      officerId: '',
    });

    setSelectedDistrict('');
  }

  const summary = overview?.summary || {};

  return (
    <>
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>विश्लेषण</h1>

          <div
            style={{
              color: 'var(--ink-3)',
              marginTop: 4,
            }}
          >
            शिकायत, अधिकारी और SLA की विस्तृत रिपोर्ट
          </div>
        </div>

        <button
          type="button"
          onClick={loadAnalytics}
          disabled={loading}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            border: '1px solid #bbb',
            background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'लोड हो रहा है...' : '↻ रीफ्रेश'}
        </button>
      </div>

      {error ? (
        <div
          className="card"
          style={{
            padding: 16,
            marginBottom: 16,
            border: '1px solid #e5b7b7',
            background: '#fff6f6',
            color: '#9b1c1c',
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        className="card"
        style={{
          padding: 16,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            marginBottom: 12,
            fontSize: 16,
          }}
        >
          फ़िल्टर
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
          }}
        >
          <label>
            <div
              style={{
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              दिनांक से
            </div>

            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) =>
                updateFilter('dateFrom', e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
              }}
            />
          </label>

          <label>
            <div
              style={{
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              दिनांक तक
            </div>

            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) =>
                updateFilter('dateTo', e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
              }}
            />
          </label>

          <label>
            <div
              style={{
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              श्रेणी
            </div>

            <select
              value={filters.category}
              onChange={(e) =>
                updateFilter('category', e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
              }}
            >
              <option value="">सभी श्रेणियाँ</option>

              {options.categories.map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div
              style={{
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              स्थिति
            </div>

            <select
              value={filters.status}
              onChange={(e) =>
                updateFilter('status', e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
              }}
            >
              <option value="">सभी स्थितियाँ</option>

              {options.statuses.map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div
              style={{
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              थाना
            </div>

            <select
              value={filters.station}
              onChange={(e) =>
                updateFilter('station', e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
              }}
            >
              <option value="">सभी थाने</option>

              {options.stations.map((item) => (
                <option
                  key={item}
                  value={item}
                >
                  {item}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div
              style={{
                fontSize: 12,
                marginBottom: 5,
              }}
            >
              अधिकारी
            </div>

            <select
              value={filters.officerId}
              onChange={(e) =>
                updateFilter('officerId', e.target.value)
              }
              style={{
                width: '100%',
                padding: 8,
              }}
            >
              <option value="">सभी अधिकारी</option>

              {options.officers.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.name}
                  {item.badgeId
                    ? ` (${item.badgeId})`
                    : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={resetFilters}
            style={{
              padding: '7px 14px',
              border: '1px solid #bbb',
              borderRadius: 6,
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            फ़िल्टर साफ़ करें
          </button>
        </div>
      </div>

      {loading && !overview ? (
        <div
          className="card"
          style={{ padding: 30 }}
        >
          Analytics data लोड हो रहा है...
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(170px, 1fr))',
              gap: 14,
              marginBottom: 18,
            }}
          >
            <Card
              title="कुल शिकायतें"
              value={summary.total}
            />

            <Card
              title="लंबित"
              value={summary.pending}
            />

            <Card
              title="निस्तारित"
              value={summary.resolved}
            />

            <Card
              title="अस्वीकृत"
              value={summary.rejected}
            />

            <Card
              title="SOS शिकायतें"
              value={summary.sosCount}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(330px, 1fr))',
              gap: 18,
              marginBottom: 18,
            }}
          >
            <div
              className="card"
              style={{ padding: 18 }}
            >
              <h2 style={{ marginTop: 0 }}>
                स्थिति सारांश
              </h2>

              {overview?.byStatus?.length ? (
                <div>
                  {overview.byStatus.map(
                    (item, index) => (
                      <div
                        key={`${item.status}-${index}`}
                        style={{
                          display: 'flex',
                          justifyContent:
                            'space-between',
                          padding: '9px 0',
                          borderBottom:
                            '1px solid #eee',
                        }}
                      >
                        <span>
                          {item.status || 'अन्य'}
                        </span>

                        <strong>
                          {item.total ?? 0}
                        </strong>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div
                  style={{
                    color: 'var(--ink-3)',
                  }}
                >
                  अभी कोई शिकायत डेटा उपलब्ध नहीं है।
                </div>
              )}
            </div>

            <div
              className="card"
              style={{ padding: 18 }}
            >
              <h2 style={{ marginTop: 0 }}>
                श्रेणीवार शिकायतें
              </h2>

              {overview?.byCategory?.length ? (
                overview.byCategory.map(
                  (item, index) => (
                    <div
                      key={`${item.category}-${index}`}
                      style={{
                        display: 'flex',
                        justifyContent:
                          'space-between',
                        padding: '9px 0',
                        borderBottom:
                          '1px solid #eee',
                      }}
                    >
                      <span>
                        {item.category || 'अन्य'}
                      </span>

                      <strong>
                        {item.total ?? 0}
                      </strong>
                    </div>
                  )
                )
              ) : (
                <div
                  style={{
                    color: 'var(--ink-3)',
                  }}
                >
                  अभी कोई category data उपलब्ध नहीं है।
                </div>
              )}
            </div>
          </div>

          <div
            className="card"
            style={{
              padding: 18,
              marginBottom: 18,
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              अधिकारी प्रदर्शन
            </h2>

            {leaderboard.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    minWidth: 700,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        नाम
                      </th>

                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        Badge ID
                      </th>

                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        थाना
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        Assigned
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        Resolved
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        Resolution %
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {leaderboard.map(
                      (item, index) => (
                        <tr
                          key={
                            item.id || index
                          }
                        >
                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.name || '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.badgeId ||
                              item.badge_id ||
                              '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.station || '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.totalAssigned ??
                              item.total_assigned ??
                              item.assigned ??
                              0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.resolved ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.resolutionRate ??
                              item.resolution_rate ??
                              0}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  color: 'var(--ink-3)',
                }}
              >
                अभी officer performance data उपलब्ध नहीं है।
              </div>
            )}
          </div>

          <div
            className="card"
            style={{
              padding: 18,
              marginBottom: 18,
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              SLA के करीब / SLA से बाहर शिकायतें
            </h2>

            <div
              style={{
                marginBottom: 12,
                color: 'var(--ink-3)',
              }}
            >
              SLA: {sla?.slaHours ?? 48} घंटे |
              चेतावनी सीमा:{' '}
              {sla?.thresholdHours ?? 38} घंटे
            </div>

            {sla?.items?.length ? (
              <div
                style={{
                  overflowX: 'auto',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    minWidth: 800,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        ID
                      </th>

                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        Category
                      </th>

                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        जिला
                      </th>

                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        थाना
                      </th>

                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        अधिकारी
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        खुले घंटे
                      </th>

                      <th
                        style={{
                          textAlign: 'center',
                          padding: 10,
                        }}
                      >
                        SLA
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {sla.items.map(
                      (item, index) => (
                        <tr
                          key={
                            item.id || index
                          }
                        >
                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.id}
                          </td>

                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.category || '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.district || '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.policeStation ||
                              '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.officerName ||
                              'असाइन नहीं'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.hoursOpen ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'center',
                            }}
                          >
                            {item.breached
                              ? '⚠️ पार'
                              : '🟡 करीब'}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  color: 'var(--ink-3)',
                }}
              >
                अभी SLA-at-risk शिकायतें नहीं हैं।
              </div>
            )}
          </div>

          <div
            className="card"
            style={{
              padding: 18,
              marginBottom: 18,
            }}
          >
            <h2 style={{ marginTop: 0 }}>
              जिला सारांश
            </h2>

            {districts.length ? (
              <div
                style={{
                  overflowX: 'auto',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    minWidth: 750,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        जिला
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        कुल
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        लंबित
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        निस्तारित
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        SOS
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        औसत समाधान समय
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {districts.map(
                      (item, index) => (
                        <tr
                          key={
                            item.district ||
                            index
                          }
                        >
                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.district || '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.total ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.pending ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.resolved ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.sosCount ??
                              item.sos_count ??
                              0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.avgResolutionHours ??
                              item.avg_resolution_hours ??
                              0}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  color: 'var(--ink-3)',
                }}
              >
                अभी district data उपलब्ध नहीं है।
              </div>
            )}
          </div>

          <div
            className="card"
            style={{ padding: 18 }}
          >
            <h2 style={{ marginTop: 0 }}>
              थाना सारांश
            </h2>

            <div style={{ marginBottom: 12 }}>
              <select
                value={selectedDistrict}
                onChange={(e) =>
                  setSelectedDistrict(
                    e.target.value
                  )
                }
                style={{
                  padding: 9,
                  minWidth: 260,
                }}
              >
                <option value="">
                  जिला चुनें
                </option>

                {districts.map(
                  (item, index) => (
                    <option
                      key={
                        item.district ||
                        index
                      }
                      value={item.district}
                    >
                      {item.district}
                    </option>
                  )
                )}
              </select>
            </div>

            {stationsSummary.length ? (
              <div
                style={{
                  overflowX: 'auto',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse:
                      'collapse',
                    minWidth: 700,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          padding: 10,
                        }}
                      >
                        थाना
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        कुल
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        लंबित
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        निस्तारित
                      </th>

                      <th
                        style={{
                          textAlign: 'right',
                          padding: 10,
                        }}
                      >
                        SOS
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {stationsSummary.map(
                      (item, index) => (
                        <tr
                          key={
                            item.policeStation ||
                            item.station ||
                            index
                          }
                        >
                          <td
                            style={{
                              padding: 10,
                            }}
                          >
                            {item.policeStation ||
                              item.police_station ||
                              item.station ||
                              '-'}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.total ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.pending ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.resolved ?? 0}
                          </td>

                          <td
                            style={{
                              padding: 10,
                              textAlign:
                                'right',
                            }}
                          >
                            {item.sosCount ??
                              item.sos_count ??
                              0}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div
                style={{
                  color: 'var(--ink-3)',
                }}
              >
                जिला चुनने के बाद थाना-वार विवरण यहाँ दिखाई देगा।
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

export default Analytics;