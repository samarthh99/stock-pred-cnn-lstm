"""Custom Keras layers copied from the Colab training script.
They MUST be registered (package="aapl") before load_model() is called."""
import tensorflow as tf
from tensorflow.keras import layers
from tensorflow.keras.utils import register_keras_serializable


@register_keras_serializable(package="aapl")
class LuongAttention(layers.Layer):
    """Multiplicative attention (kept so the file also loads if USE_ATTENTION=True)."""
    def build(self, input_shape):
        d = int(input_shape[-1])
        self.Wa = self.add_weight(name="Wa", shape=(d, d), initializer="glorot_uniform")

    def call(self, h):
        h_T = h[:, -1, :]
        u = tf.einsum("ij,bj->bi", self.Wa, h_T)
        scores = tf.einsum("bti,bi->bt", h, u)
        a = tf.nn.softmax(scores, axis=-1)
        c = tf.einsum("bt,btd->bd", a, h)
        return tf.concat([c, h_T], axis=-1)

    def compute_output_shape(self, input_shape):
        return (input_shape[0], 2 * input_shape[-1])


@register_keras_serializable(package="aapl")
class PriceHead(layers.Layer):
    """next close = today's close * exp(predicted log return, un-standardised)."""
    def __init__(self, mu=0.0, sigma=1.0, **kw):
        super().__init__(**kw)
        self.mu, self.sigma = float(mu), float(sigma)

    def call(self, inputs):
        r_scaled, prev_close = inputs
        return prev_close * tf.exp(r_scaled * self.sigma + self.mu)

    def compute_output_shape(self, input_shape):
        return input_shape[0]

    def get_config(self):
        return {**super().get_config(), "mu": self.mu, "sigma": self.sigma}
