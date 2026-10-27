"""Seeds the single course this product currently focuses on: Business
Analytics, with the real syllabus structure provided by the instructor.
Content weeks get real study notes (chunked + indexed for RAG); admin/no-
class/exam weeks get the module with no material, matching the syllabus."""

import sys
import uuid
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.core.config import settings  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.course import Course, CourseMaterial, Module  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.services.chunking import chunk_text  # noqa: E402
from app.services.vector_store import index_material_chunks  # noqa: E402

INSTRUCTOR_EMAIL = "instructor@demo.com"
COURSE_NAME = "Business Analytics"

# (title, content_or_None). None means an admin/no-class/exam week with no
# uploaded material — the module still exists so the course structure
# mirrors the real syllabus exactly.
MODULES: list[tuple[str, str | None]] = [
    (
        "Week 1 (Jan 12): Intro to Business Analytics",
        "Business analytics is the practice of using data, statistical methods, and "
        "quantitative reasoning to drive business decisions. It is commonly split into "
        "three types: descriptive analytics (what happened — summarizing historical data), "
        "predictive analytics (what is likely to happen — using statistical models to "
        "forecast future outcomes), and prescriptive analytics (what should we do — using "
        "optimization and decision models to recommend actions). Data-driven decision "
        "making means using evidence from data rather than intuition alone, and it requires "
        "understanding the source, quality, and limitations of the data being analyzed. A "
        "key first step in any analytics project is defining the business question clearly "
        "before choosing a method.",
    ),
    ("Bellini Certification Program", None),
    ("(Jan 19): No Class - MLK Day", None),
    (
        "Week 2 (Jan 26): Descriptive Analytics: Summarizing Data",
        "Descriptive statistics summarize the central tendency and spread of a dataset. "
        "Measures of central tendency include the mean (arithmetic average, sensitive to "
        "outliers), median (the middle value, robust to outliers), and mode (the most "
        "frequent value). Measures of dispersion describe how spread out the data is: "
        "range (max minus min), variance (average squared deviation from the mean), "
        "standard deviation (square root of variance, in the original units), and the "
        "interquartile range (IQR, the range of the middle 50% of data, robust to "
        "outliers). Skewness describes asymmetry in a distribution: right-skewed data has "
        "a long right tail (mean > median), left-skewed data has a long left tail "
        "(mean < median).",
    ),
    (
        "Week 3 (Feb 2): Descriptive Analytics: Graphs & Pivot Tables",
        "Visualizing data helps reveal patterns that summary statistics alone can miss. "
        "Histograms show the distribution shape of a single numeric variable by binning "
        "values into intervals. Boxplots display the median, quartiles, and potential "
        "outliers using the five-number summary (min, Q1, median, Q3, max). Scatter plots "
        "show the relationship between two numeric variables and can reveal linear or "
        "nonlinear association. Pivot tables summarize and cross-tabulate data by grouping "
        "rows and columns and aggregating a measure (sum, average, count) within each "
        "group — they are especially useful for exploring how a metric varies across "
        "categorical dimensions like region, product, or time period.",
    ),
    (
        "Week 4 (Feb 9): Probability Distributions",
        "A probability distribution describes how likely each possible outcome of a "
        "random variable is. Discrete distributions apply to countable outcomes: the "
        "binomial distribution models the number of successes in a fixed number of "
        "independent yes/no trials with constant success probability, while the Poisson "
        "distribution models the number of events occurring in a fixed interval of time "
        "or space. Continuous distributions apply to outcomes measured on a continuum: "
        "the uniform distribution assigns equal probability density across a range, and "
        "the normal (Gaussian) distribution is a symmetric bell-shaped curve defined by "
        "its mean and standard deviation, and underlies much of inferential statistics "
        "via the Central Limit Theorem. Expected value is the long-run average outcome; "
        "variance measures the spread of outcomes around that average.",
    ),
    (
        "Week 5 (Feb 16): Point & Interval Estimates",
        "A point estimate is a single value (such as a sample mean) used to estimate an "
        "unknown population parameter. Because a sample only approximates the population, "
        "estimates carry uncertainty, quantified by the standard error — the standard "
        "deviation of the sampling distribution of the estimate. A confidence interval "
        "gives a range of plausible values for the population parameter, built as the "
        "point estimate plus or minus a margin of error, at a chosen confidence level "
        "(commonly 95%). The margin of error depends on the standard error and a critical "
        "value from either the z-distribution (when the population standard deviation is "
        "known or the sample is large) or the t-distribution (when it is unknown and the "
        "sample is small) — the t-distribution has heavier tails to account for the extra "
        "uncertainty of estimating the standard deviation from the sample itself.",
    ),
    (
        "Week 6 (Feb 23): Hypotheses Testing I",
        "Hypothesis testing evaluates a claim about a population using sample data. The "
        "null hypothesis (H0) represents the default assumption (e.g. no effect, no "
        "difference), while the alternative hypothesis (H1) represents what we're trying "
        "to find evidence for. A Type I error is rejecting a true null hypothesis (a false "
        "positive), with probability controlled by the significance level alpha (commonly "
        "0.05). A Type II error is failing to reject a false null hypothesis (a false "
        "negative). The p-value is the probability of observing a result at least as "
        "extreme as the sample result, assuming the null hypothesis is true — if the "
        "p-value is below alpha, we reject the null hypothesis. A one-sample z-test or "
        "t-test compares a sample mean to a hypothesized population value, using the "
        "z-distribution or t-distribution depending on whether the population standard "
        "deviation is known.",
    ),
    (
        "Week 7 (Mar 2): Hypotheses Testing II",
        "Beyond one-sample tests, a two-sample t-test compares the means of two "
        "independent groups to test whether they differ significantly, while a paired "
        "t-test compares two measurements taken on the same subjects (e.g. before and "
        "after), which controls for individual variation by analyzing the differences "
        "directly. The chi-square test is used for categorical data: a chi-square "
        "goodness-of-fit test checks whether observed frequencies match an expected "
        "distribution, and a chi-square test of independence checks whether two "
        "categorical variables are associated, by comparing observed counts in a "
        "contingency table to the counts expected under independence.",
    ),
    ("Week 8 (Mar 9): MIDTERMS", None),
    ("MAR 16: No Class - Spring Break", None),
    (
        "Week 10 (Mar 23): ANOVA Analysis",
        "Analysis of Variance (ANOVA) tests whether the means of three or more groups "
        "are significantly different, without inflating the false-positive risk that "
        "running many pairwise t-tests would cause. One-way ANOVA compares group means "
        "using a single categorical factor. It works by partitioning total variance into "
        "between-group variance (how much group means differ from the overall mean) and "
        "within-group variance (how much individual observations vary within their own "
        "group). The F-statistic is the ratio of between-group to within-group variance — "
        "a large F suggests the group means differ more than random chance would predict. "
        "If ANOVA finds a significant difference, post-hoc tests (such as Tukey's HSD) "
        "are used to determine which specific pairs of groups differ.",
    ),
    (
        "Week 11 (Mar 30): Simple & Multiple Regression",
        "Simple linear regression models the relationship between one predictor "
        "(independent variable) and one outcome (dependent variable) as a straight line, "
        "fit using ordinary least squares — the line that minimizes the sum of squared "
        "residuals (the vertical distances between observed points and the fitted line). "
        "R-squared measures the proportion of variance in the outcome explained by the "
        "model, ranging from 0 to 1. Multiple regression extends this to several "
        "predictors simultaneously; each coefficient represents the expected change in "
        "the outcome for a one-unit increase in that predictor, holding all other "
        "predictors constant.",
    ),
    (
        "Week 12 (Apr 6): Multiple Regression Assumptions & Interaction Effects",
        "Multiple regression relies on several key assumptions: linearity (the "
        "relationship between predictors and the outcome is linear), independence of "
        "errors, homoscedasticity (constant variance of residuals across all predictor "
        "values — violated when residual spread widens or narrows systematically), "
        "normality of residuals, and low multicollinearity (predictors should not be too "
        "highly correlated with each other, which inflates coefficient standard errors "
        "and makes individual effects hard to interpret). An interaction effect occurs "
        "when the effect of one predictor on the outcome depends on the level of another "
        "predictor — modeled by including a product term of the two predictors in the "
        "regression.",
    ),
    (
        "Week 13 (Apr 13): Multiple Regression with Non-Linearity",
        "When the relationship between a predictor and the outcome isn't a straight line, "
        "regression can still capture it by transforming variables. Polynomial regression "
        "adds squared (or higher-order) terms of a predictor to model curvature, such as "
        "diminishing or accelerating returns. Log transformations of the outcome, a "
        "predictor, or both are used when a relationship is multiplicative rather than "
        "additive, or when the outcome is right-skewed — a log-log model produces "
        "coefficients interpretable as elasticities (percentage change in the outcome per "
        "percentage change in the predictor). Choosing between these forms is guided by "
        "residual plots: patterns remaining in the residuals after fitting a linear model "
        "indicate unmodeled non-linearity.",
    ),
    (
        "Week 14 (Apr 20): Time Series Forecasting",
        "Time series data consists of observations recorded sequentially over time, and "
        "forecasting methods exploit patterns such as trend (a long-term upward or "
        "downward movement) and seasonality (a pattern that repeats at fixed intervals, "
        "such as quarterly or monthly). A moving average smooths short-term fluctuations "
        "by averaging a fixed window of recent observations. Exponential smoothing "
        "instead weights recent observations more heavily than older ones, with the "
        "weighting controlled by a smoothing parameter. Forecast accuracy is commonly "
        "measured using mean absolute error (MAE) or mean squared error (MSE) on held-out "
        "data the model didn't see while fitting, to check that the model generalizes "
        "rather than just fitting historical noise.",
    ),
    ("Week 15 (Apr 27): No Class", None),
    ("Week 16 (May 4): FINALS EXAM", None),
]


def main():
    db = SessionLocal()
    try:
        instructor = db.query(User).filter(User.email == INSTRUCTOR_EMAIL).first()
        if instructor is None:
            instructor = User(
                email=INSTRUCTOR_EMAIL,
                password_hash=hash_password("password123"),
                role=UserRole.instructor,
            )
            db.add(instructor)
            db.commit()
            db.refresh(instructor)
            print(f"Created instructor {INSTRUCTOR_EMAIL}")

        existing = db.query(Course).filter(Course.name == COURSE_NAME, Course.instructor_id == instructor.id).first()
        if existing is not None:
            print(f"Course '{COURSE_NAME}' already exists, skipping.")
            return

        course = Course(name=COURSE_NAME, instructor_id=instructor.id)
        db.add(course)
        db.commit()
        db.refresh(course)
        print(f"Created course: {course.name}")

        storage_dir = Path(settings.course_material_storage_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)

        for title, content in MODULES:
            module = Module(course_id=course.id, title=title, description=None)
            db.add(module)
            db.commit()
            db.refresh(module)
            print(f"  Created module: {title}")

            if content is None:
                continue

            material_id = uuid.uuid4()
            filename = f"{title.split(':')[0].strip().replace(' ', '_')}_notes.txt"
            dest_path = storage_dir / f"{material_id}.txt"
            dest_path.write_text(content)

            material = CourseMaterial(
                id=material_id,
                module_id=module.id,
                file_path=str(dest_path),
                original_filename=filename,
                content_type="text/plain",
            )
            db.add(material)
            db.commit()

            chunks = chunk_text(content)
            index_material_chunks(material.id, module.id, chunks)
            material.indexed = True
            db.commit()
            print(f"    Uploaded + indexed material ({len(chunks)} chunk(s))")

        print("\nSeed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
