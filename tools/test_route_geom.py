import numpy as np

import route_geom


def _arc(radius, sweep=1.5, n=400):
    th = np.linspace(0, sweep, n)
    return np.c_[radius * np.cos(th), radius * np.sin(th)], radius * (th[1] - th[0])


def test_min_bend_radius_of_a_circle():
    xy, step = _arc(300.0)
    assert abs(route_geom.min_bend_radius(xy, step) - 300.0) < 1.0


def test_curvature_handles_uneven_spacing():
    xy, _ = _arc(300.0)
    uneven = xy[np.r_[0:200:1, 200:400:2]]
    k = route_geom.curvature(uneven, stride=4)
    assert abs(1 / np.median(k) - 300.0) < 5.0


def test_limit_curvature_removes_tight_bends_and_keeps_ends():
    step = 50.0
    x = np.arange(0, 20000, step)
    y = 400.0 * np.sin(x / 700.0)  # radius well under 2 km at the crests
    xy = np.c_[x, y]
    limited, passes = route_geom.limit_curvature(xy, step, 2000.0, local_sigma=1500.0, stride_m=200.0)
    assert passes > 0
    assert route_geom.min_bend_radius(limited, step, 200.0) > 0.9 * 2000.0
    assert np.allclose(limited[0], xy[0]) and np.allclose(limited[-1], xy[-1])


def test_limit_curvature_is_a_noop_on_a_gentle_curve():
    xy, step = _arc(5000.0)
    limited, passes = route_geom.limit_curvature(xy, step, 1000.0, local_sigma=500.0, stride_m=200.0)
    assert passes == 0 and np.allclose(limited, xy)


def test_adjacent_estimator_catches_a_short_kink_that_a_wide_stencil_misses():
    x = np.arange(0, 2000, 10.0)
    y = np.zeros_like(x)
    y[100] = 8.0  # one-sample 8 m spike on a straight line
    xy = np.c_[x, y]
    assert route_geom.min_bend_radius(xy, 10.0) < 20.0
    assert route_geom.min_bend_radius(xy, 10.0, stride_m=100.0) > 300.0
