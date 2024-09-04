interface Math {
    factorial(n: number): number;
}

Math.factorial = function(n: number): number {
    if (n === 0 || n === 1) {
        return 1;
    }
    return n * Math.factorial(n - 1);
};
