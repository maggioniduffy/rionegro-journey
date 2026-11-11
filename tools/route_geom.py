"""Numeric helpers for the route centerline: smoothing, curvature limiting, resampling."""
import numpy as np


def arc_length(xy):
    """Cumulative arc length of a polyline, starting at 0."""
    seg = np.hypot(*np.diff(xy, axis=0).T)
    return np.r_[0.0, np.cumsum(seg)]


def resample_uniform(xy, step):
    """Resample a polyline at a fixed arc-length step; the last vertex is always kept.

    Returns (points, arc) where arc is the original arc length of each new point.
    """
    arc = arc_length(xy)
    t = np.arange(0.0, arc[-1], step)
    if arc[-1] - t[-1] > 1e-9:
        t = np.r_[t, arc[-1]]
    pts = np.c_[np.interp(t, arc, xy[:, 0]), np.interp(t, arc, xy[:, 1])]
    return pts, t


def gaussian_smooth(xy, sigma, step):
    """Gaussian-smooth a uniformly sampled polyline, keeping both end points fixed.

    The ends are padded by odd reflection so the curve does not shrink towards the middle.
    """
    if sigma <= 0:
        return xy.copy()
    k = int(np.ceil(4 * sigma / step))
    w = np.exp(-0.5 * (np.arange(-k, k + 1) * step / sigma) ** 2)
    w /= w.sum()
    pre = 2 * xy[0] - xy[k:0:-1]
    post = 2 * xy[-1] - xy[-2 : -k - 2 : -1]
    z = np.vstack([pre, xy, post])
    out = np.c_[np.convolve(z[:, 0], w, "valid"), np.convolve(z[:, 1], w, "valid")]
    out[0], out[-1] = xy[0], xy[-1]
    return out


def curvature(xy, stride=1):
    """Unsigned curvature (1/m) at each vertex: heading change over `stride` segments per metre of arc.

    Uses the real arc length between segment midpoints, so it stays correct when vertex spacing is not uniform
    (as after smoothing a polyline that was sampled uniformly before smoothing).
    """
    d = np.diff(xy, axis=0)
    heading = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))
    arc = arc_length(xy)
    mid = (arc[:-1] + arc[1:]) / 2
    kappa = np.abs(heading[stride:] - heading[:-stride]) / (mid[stride:] - mid[:-stride])
    pad = stride // 2
    return np.r_[np.full(pad + 1, kappa[0]), kappa, np.full(len(xy) - 1 - len(kappa) - pad, kappa[-1])][: len(xy)]


def min_bend_radius(xy, step, stride_m=None):
    """Minimum bend radius (m) of a uniformly sampled polyline.

    Default is the finest estimator: the circumradius through adjacent samples (i-1, i, i+1). That is what decides
    whether an offset strip meshed close to the centerline folds. Pass `stride_m` to use a wider stencil
    (samples `stride_m` apart), which is smoother but can miss short tight kinks.
    """
    h = 1 if stride_m is None else max(1, int(round(stride_m / step)))
    a, b, c = xy[:-2 * h], xy[h:-h], xy[2 * h:]
    ab, bc, ca = (np.hypot(*(p - q).T) for p, q in ((a, b), (b, c), (c, a)))
    cross = np.abs((b[:, 0] - a[:, 0]) * (c[:, 1] - a[:, 1]) - (b[:, 1] - a[:, 1]) * (c[:, 0] - a[:, 0]))
    with np.errstate(divide="ignore"):
        radius = ab * bc * ca / (2 * np.maximum(cross, 1e-12))
    return float(radius.min())


def limit_curvature(xy, step, min_radius, local_sigma, stride_m=100.0, max_iter=300):
    """Locally blend towards a smoother curve wherever the bend radius is below `min_radius` (same units as xy).

    `stride_m` is the arc length over which the bend is measured; 0 means adjacent vertices (finest). Each pass finds the tight spots, grows that mask by `local_sigma`, and moves those vertices towards a
    Gaussian-smoothed copy. Stops once no vertex is tighter than the limit, or after `max_iter` passes.
    Returns (points, iterations_used).
    """
    out = xy.copy()
    stride = max(1, int(round(stride_m / step))) if stride_m else 1  # `step` is the nominal vertex spacing
    for it in range(max_iter):
        tight = curvature(out, stride) > 1.0 / min_radius
        if not tight.any():
            return out, it
        weight = gaussian_smooth(np.c_[tight.astype(float), np.zeros(len(tight))], local_sigma, step)[:, 0]
        weight = np.clip(weight * 3.0, 0.0, 1.0)[:, None]
        out = out + weight * (gaussian_smooth(out, local_sigma, step) - out)
        out[0], out[-1] = xy[0], xy[-1]
    return out, max_iter
